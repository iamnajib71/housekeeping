-- Run through Supabase execute_sql. All fixtures and queued emails roll back.
begin;
do $$
declare member uuid; other_member uuid; s public.submissions; first_start timestamptz;
begin
  select id into member from public.members order by position limit 1;
  select id into other_member from public.members where id<>member order by position limit 1;
  insert into public.assignments(id,date,kind,member_ids,tasks) values
    ('feedback-integration-2000-01-02','2000-01-02','daily',array[member],array['Kitchen','Bathroom','Oven']),
    ('feedback-integration-2000-01-03','2000-01-03','daily',array[member],array['Kitchen']);
  begin
    perform public.start_clean('feedback-integration-2000-01-02',other_member);
    raise exception 'Expected membership guard';
  exception when others then if sqlerrm<>'Not assigned' then raise; end if; end;
  s:=public.start_clean('feedback-integration-2000-01-02',member);
  first_start:=s.started_at;
  if first_start is null then raise exception 'Start not saved'; end if;
  s:=public.start_clean(s.assignment_id,member);
  if s.started_at<>first_start then raise exception 'Repeated Start reset the timer'; end if;
  insert into public.photos(submission_id,path,uploaded) values(s.id,'integration/'||s.id,true);
  s:=public.submit_clean(s.assignment_id,member,array['Kitchen'],'');
  if s.finished_at is null or s.finished_at<>s.submitted_at or s.finished_at<s.started_at then
    raise exception 'End time does not match submission time'; end if;
  begin
    perform public.review_tasks(s.id,'[{"task":"Kitchen","status":"approved","note":""},{"task":"Bathroom","status":"rework","note":""}]');
    raise exception 'Expected required reason';
  exception when others then if sqlerrm<>'Choose valid tasks and a reason for every task needing fixes' then raise; end if; end;
  begin
    perform public.review_tasks(s.id,'[{"task":"Bathroom","status":"rework","note":"Missing"}]');
    raise exception 'Expected review coverage guard';
  exception when others then if sqlerrm<>'Review every submitted task' then raise; end if; end;
  perform public.review_tasks(s.id,'[{"task":"Kitchen","status":"approved","note":""},{"task":"Bathroom","status":"rework","note":"Clean the shower drain."}]');
  select * into s from public.submissions where id=s.id;
  if s.status<>'rework' or s.task_feedback->1->>'task'<>'Bathroom' then raise exception 'Missing-task review not stored'; end if;
  if (select count(*) from public.email_jobs where assignment_id=s.assignment_id and kind='rework')<>1 then raise exception 'Fix email not queued exactly once'; end if;
  begin
    perform public.save_draft(s.assignment_id,member,array['Bathroom'],'');
    raise exception 'Expected accepted-task guard';
  exception when others then if sqlerrm<>'Previously accepted tasks must stay in the submission' then raise; end if; end;
  begin
    perform public.submit_clean(s.assignment_id,member,array['Kitchen'],'');
    raise exception 'Expected missing-task resubmit guard';
  exception when others then if sqlerrm<>'Complete each task needing fixes before resubmitting' then raise; end if; end;
  -- No second Start: preserve the first review end until resubmission, then mark this round untimed.
  s:=public.submit_clean(s.assignment_id,member,array['Kitchen','Bathroom'],'Fixed');
  if s.started_at is not null or s.finished_at is null or s.task_feedback->0->>'status'<>'approved'
     or s.task_feedback->1->>'status'<>'pending' then raise exception 'Resubmission state incorrect'; end if;
  begin
    perform public.review_tasks(s.id,'[{"task":"Kitchen","status":"rework","note":"Changed my mind"},{"task":"Bathroom","status":"approved","note":""}]');
    raise exception 'Expected prior approval guard';
  exception when others then if sqlerrm<>'Previously accepted tasks remain accepted' then raise; end if; end;
  perform public.review_tasks(s.id,'[{"task":"Kitchen","status":"approved","note":""},{"task":"Bathroom","status":"rework","note":"Drain still blocked"}]');
  s:=public.start_clean(s.assignment_id,member);
  if s.started_at is null or s.finished_at is not null then raise exception 'Rework Start did not begin a new session'; end if;
  s:=public.submit_clean(s.assignment_id,member,array['Kitchen','Bathroom'],'Fixed again');
  if s.started_at is null or s.finished_at<s.started_at then raise exception 'Timed rework session incorrect'; end if;
  -- Legacy whole-review clients continue to work and normalize per-task status.
  perform public.review_clean(s.id,'approved','');
  select * into s from public.submissions where id=s.id;
  if s.status<>'approved' or exists(select 1 from jsonb_array_elements(s.task_feedback) f where f->>'status'<>'approved') then raise exception 'Legacy approval incorrect'; end if;
  begin
    perform public.start_clean(s.assignment_id,member);
    raise exception 'Expected locked-submission guard';
  exception when others then if sqlerrm<>'This submission is locked' then raise; end if; end;
  -- A separate first-time submission requires no Start.
  s:=public.save_draft('feedback-integration-2000-01-03',member,array['Kitchen'],'');
  insert into public.photos(submission_id,path,uploaded) values(s.id,'integration/'||s.id,true);
  s:=public.submit_clean(s.assignment_id,member,array['Kitchen'],'');
  if s.started_at is not null or s.finished_at is null then raise exception 'Start became mandatory'; end if;
  if has_function_privilege('anon','public.review_tasks(uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.start_clean(text,uuid)','EXECUTE') then raise exception 'Browser RPC access exposed'; end if;
end $$;
select 'Task feedback, reason validation, accepted-task guards, email queue, timing, legacy compatibility and permissions passed' as result;
rollback;
