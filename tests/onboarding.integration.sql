-- Run through Supabase execute_sql; all replacement fixtures roll back.
begin;
do $$
declare admin_id uuid; member_id uuid; trial public.walkthrough_trials; s public.household_settings;
  protected jsonb; pair record; updated integer;
begin
  select id into admin_id from public.members where role='admin' order by position limit 1;
  select id into member_id from public.members where role='member' order by position limit 1;
  select * into s from public.household_settings where id=1;
  insert into public.assignments(id,date,kind,member_ids,tasks) values
    ('walkthrough-test-draft','2050-01-01','daily',array[admin_id],array['Original draft duty']),
    ('walkthrough-test-submitted','2050-01-02','daily',array[admin_id],array['Original submitted duty']),
    ('walkthrough-test-unstarted','2050-01-03','daily',array[admin_id],array['Original unstarted duty']);
  insert into public.submissions(assignment_id,member_id,status,tasks,submitted_at) values
    ('walkthrough-test-draft',admin_id,'draft',array['Original draft duty'],null),
    ('walkthrough-test-submitted',admin_id,'submitted',array['Original submitted duty'],now());
  select jsonb_object_agg(a.id,to_jsonb(a.tasks)) into protected from public.assignments a
    where exists(select 1 from public.submissions sub where sub.assignment_id=a.id);
  begin
    perform public.begin_walkthrough(member_id,array[1.0]::double precision[]);
    raise exception 'Expected admin guard';
  exception when others then if sqlerrm<>'Admin only' then raise; end if; end;
  trial:=public.begin_walkthrough(admin_id,array[1.0,5.0]::double precision[]);
  begin
    perform public.begin_walkthrough(admin_id,array[1.0]::double precision[]);
    raise exception 'Expected rate guard';
  exception when others then if sqlerrm<>'Wait one minute before another analysis' then raise; end if; end;
  update public.walkthrough_trials set status='ready',plan='{"areas":[]}' where id=trial.id;
  updated:=public.apply_walkthrough(trial.id,admin_id,'{"areas":[]}',array['Trial kitchen: Wipe benches'],array['Trial kitchen: Clean oven'],array['Trial kitchen']);
  if updated<1 then raise exception 'No unstarted assignments updated'; end if;
  if (select tasks from public.assignments where id='walkthrough-test-unstarted')<>array['Trial kitchen: Wipe benches'] then raise exception 'Unstarted duty was not replaced'; end if;
  for pair in select * from jsonb_each(protected) loop
    if (select to_jsonb(tasks) from public.assignments where id=pair.key)<>pair.value then raise exception 'Started/submitted duty was changed'; end if;
  end loop;
  if (select cleaning_areas from public.household_settings where id=1)<>array['Trial kitchen'] then raise exception 'Active area names were not replaced'; end if;
  if exists(select 1 from public.household_settings where id=1 and
    (morning_hour<>s.morning_hour or evening_hour<>s.evening_hour or deadline_hour<>s.deadline_hour
     or reminders_enabled<>s.reminders_enabled or daily_start<>s.daily_start or weekly_start<>s.weekly_start or timezone<>s.timezone)) then raise exception 'Existing routine settings changed'; end if;
  if (select applied_at from public.walkthrough_trials where id=trial.id) is null then raise exception 'Applied state not saved'; end if;
  if has_table_privilege('authenticated','public.walkthrough_trials','SELECT')
    or has_function_privilege('anon','public.apply_walkthrough(uuid,uuid,jsonb,text[],text[],text[])','EXECUTE') then raise exception 'Private onboarding data exposed'; end if;
end $$;
select 'Admin-only trials, rate limits, area replacement, preservation of started work and reminders, and browser role isolation passed' as result;
rollback;
