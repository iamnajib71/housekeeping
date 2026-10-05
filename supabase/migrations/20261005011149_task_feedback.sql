-- Additive: existing clients continue to use the whole-submission review RPC.
alter table public.submissions add column task_feedback jsonb not null default '[]'::jsonb
  check (jsonb_typeof(task_feedback) = 'array');
alter table public.submissions add column started_at timestamptz, add column finished_at timestamptz;
update public.submissions set finished_at=submitted_at where submitted_at is not null;

create function public.preserve_accepted_tasks()
returns trigger language plpgsql security invoker set search_path='' as $$
declare accepted text[];
begin
  select coalesce(array_agg(f->>'task'),'{}'::text[]) into accepted
  from jsonb_array_elements(old.task_feedback) f where f->>'status'='approved';
  if not (accepted <@ new.tasks) then
    raise exception 'Previously accepted tasks must stay in the submission';
  end if;
  if new.status='submitted' and old.status in ('draft','rework') then
    if exists (select 1 from jsonb_array_elements(old.task_feedback) f
               where f->>'status'='rework' and not (f->>'task'=any(new.tasks))) then
      raise exception 'Complete each task needing fixes before resubmitting';
    end if;
    select coalesce(jsonb_agg(case when f->>'status'='approved' then f
      else jsonb_set(f,'{status}','"pending"'::jsonb) end),'[]'::jsonb)
    into new.task_feedback from jsonb_array_elements(old.task_feedback) f;
    -- A new optional start clears the old end; otherwise a resubmission is untimed.
    if old.finished_at is not null then new.started_at:=null; end if;
    new.finished_at:=clock_timestamp();
    new.submitted_at:=new.finished_at;
  end if;
  return new;
end $$;
create trigger preserve_accepted_tasks before update of tasks,status on public.submissions
for each row execute function public.preserve_accepted_tasks();

create function public.review_tasks(p_submission uuid,p_feedback jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.submissions; a public.assignments; f jsonb; normalized jsonb:='[]'::jsonb; reason text;
begin
  select * into s from public.submissions where id=p_submission for update;
  if s.id is null or s.status<>'submitted' then raise exception 'This submission has already been reviewed'; end if;
  select * into a from public.assignments where id=s.assignment_id;
  if p_feedback is null or jsonb_typeof(p_feedback)<>'array' then raise exception 'Invalid task feedback'; end if;
  if jsonb_array_length(p_feedback)<cardinality(s.tasks) or jsonb_array_length(p_feedback)>30
     or not(s.tasks <@ array(select value->>'task' from jsonb_array_elements(p_feedback))) then raise exception 'Review every submitted task'; end if;
  if (select count(distinct value->>'task') from jsonb_array_elements(p_feedback))<>jsonb_array_length(p_feedback) then
    raise exception 'Review each task exactly once';
  end if;
  for f in select value from jsonb_array_elements(p_feedback) loop
    if jsonb_typeof(f)<>'object' or jsonb_typeof(f->'task') is distinct from 'string'
       or not (f->>'task'=any(a.tasks)) or f->>'status' is null or f->>'status' not in ('approved','rework')
       or (f->>'status'='approved' and not(f->>'task'=any(s.tasks)))
       or jsonb_typeof(f->'note') is distinct from 'string' or length(f->>'note')>500
       or (f->>'status'='rework' and length(trim(f->>'note'))=0) then
      raise exception 'Choose valid tasks and a reason for every task needing fixes';
    end if;
    if f->>'status'<>'approved' and exists (select 1 from jsonb_array_elements(s.task_feedback) previous
       where previous->>'task'=f->>'task' and previous->>'status'='approved') then
      raise exception 'Previously accepted tasks remain accepted';
    end if;
    normalized:=normalized||jsonb_build_array(jsonb_build_object('task',f->>'task','status',f->>'status',
      'note',case when f->>'status'='rework' then trim(f->>'note') else '' end));
  end loop;
  select string_agg((value->>'task')||': '||(value->>'note'), E'\n') into reason
  from jsonb_array_elements(normalized) where value->>'status'='rework';
  update public.submissions set task_feedback=normalized,
    status=case when reason is null then 'approved' else 'rework' end,
    review_note=left(coalesce(reason,''),1000) where id=s.id;
  if reason is not null then
    insert into public.email_jobs(dedupe_key,member_id,assignment_id,kind)
    values('rework:'||s.id::text||':'||s.submitted_at::text,s.member_id,s.assignment_id,'rework')
    on conflict(dedupe_key) do nothing;
  end if;
end $$;

-- Old deployed clients can still review whole submissions during the rollout.
create or replace function public.review_clean(p_submission uuid,p_status text,p_note text)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.submissions; feedback jsonb;
begin
  if p_status is null or p_status not in ('approved','rework')
     or (p_status='rework' and (p_note is null or length(trim(p_note))=0)) then
    raise exception 'Invalid review';
  end if;
  select * into s from public.submissions where id=p_submission for update;
  if s.id is null or s.status<>'submitted' then raise exception 'This submission has already been reviewed'; end if;
  select jsonb_agg(jsonb_build_object('task',task,'status',case
    when p_status='approved' or exists(select 1 from jsonb_array_elements(s.task_feedback) f
      where f->>'task'=task and f->>'status'='approved') then 'approved' else 'rework' end,
    'note',case when p_status='rework' then left(trim(p_note),500) else '' end))
  into feedback from unnest(s.tasks) task;
  perform public.review_tasks(p_submission,feedback);
end $$;

create function public.start_clean(p_assignment text,p_member uuid)
returns public.submissions language plpgsql security invoker set search_path='' as $$
declare a public.assignments; s public.submissions;
begin
  select * into a from public.assignments where id=p_assignment for update;
  if a.id is null or not(p_member=any(a.member_ids)) then raise exception 'Not assigned'; end if;
  if a.date>(now() at time zone 'Australia/Melbourne')::date then raise exception 'Cleaning opens on the assigned date'; end if;
  insert into public.submissions(assignment_id,member_id) values(p_assignment,p_member)
    on conflict(assignment_id,member_id) do nothing;
  select * into s from public.submissions where assignment_id=p_assignment and member_id=p_member for update;
  if s.status not in ('draft','rework') then raise exception 'This submission is locked'; end if;
  if s.started_at is null or s.finished_at is not null then
    update public.submissions set started_at=clock_timestamp(),finished_at=null where id=s.id returning * into s;
  end if;
  return s;
end $$;

revoke execute on function public.review_tasks(uuid,jsonb),public.preserve_accepted_tasks() from public,anon,authenticated;
grant execute on function public.review_tasks(uuid,jsonb),public.preserve_accepted_tasks() to service_role;
revoke execute on function public.start_clean(text,uuid) from public,anon,authenticated;
grant execute on function public.start_clean(text,uuid) to service_role;
