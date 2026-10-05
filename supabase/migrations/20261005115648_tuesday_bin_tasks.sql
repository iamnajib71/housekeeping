-- Collection dates come from the household's supplied 2026 council calendar.
-- Unknown years retain the Tuesday duty without guessing the recycling cycle.
create function public.daily_tasks_for_date(p_tasks text[], p_date date)
returns text[] language plpgsql immutable security invoker set search_path='' as $$
declare tasks text[]; extra text; duty text;
begin
  select coalesce(array_agg(replace(t,'; put due collection bins out Tuesday night','') order by n),array[]::text[]) into tasks
    from unnest(p_tasks) with ordinality as items(t,n)
    where t not like 'Put collection bins out Tuesday night%' and t<>'Check for Bin Collection (Tuesday)';
  if extract(isodow from p_date)<>2 then return tasks; end if;
  select c.lids into extra from (values
    ('2026-09-23'::date,'Red lid, Green lid, Yellow lid'),('2026-09-30'::date,'Red lid, Green lid, Purple lid'),
    ('2026-10-07'::date,'Red lid, Green lid, Yellow lid'),('2026-10-14'::date,'Red lid, Green lid'),
    ('2026-10-21'::date,'Red lid, Green lid, Yellow lid'),('2026-10-28'::date,'Red lid, Green lid, Purple lid'),
    ('2026-11-04'::date,'Red lid, Green lid, Yellow lid'),('2026-11-11'::date,'Red lid, Green lid'),
    ('2026-11-18'::date,'Red lid, Green lid, Yellow lid'),('2026-11-25'::date,'Red lid, Green lid, Purple lid'),
    ('2026-12-02'::date,'Red lid, Green lid, Yellow lid'),('2026-12-09'::date,'Red lid, Green lid'),
    ('2026-12-16'::date,'Red lid, Green lid, Yellow lid'),('2026-12-23'::date,'Red lid, Green lid, Purple lid'),
    ('2026-12-30'::date,'Red lid, Green lid, Yellow lid')
  ) as c(date,lids) where c.date=p_date+1;
  duty=case when extra is null then 'Put collection bins out Tuesday night; check council calendar for lids due'
    else 'Put collection bins out Tuesday night: '||extra||' (Wednesday collection)' end;
  return array_append(tasks,duty);
end $$;

create function public.set_assignment_bin_duty()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.kind='daily' and new.date>=(now() at time zone 'Australia/Melbourne')::date
    and not exists(select 1 from public.submissions where assignment_id=new.id) then
    new.tasks=public.daily_tasks_for_date(new.tasks,new.date);
  end if;
  return new;
end $$;
revoke execute on function public.daily_tasks_for_date(text[],date),public.set_assignment_bin_duty() from public,anon,authenticated;
grant execute on function public.daily_tasks_for_date(text[],date),public.set_assignment_bin_duty() to service_role;
create trigger assignment_bin_duty before insert or update of tasks,date,kind on public.assignments
  for each row execute function public.set_assignment_bin_duty();

-- Lock before checking for submissions, matching setup replacement lock order.
do $$
begin
  perform 1 from public.household_settings where id=1 for update;
  perform 1 from public.assignments where date>=(now() at time zone 'Australia/Melbourne')::date order by id for update;
  update public.household_settings set daily_tasks=public.daily_tasks_for_date(daily_tasks,'2026-10-07'::date) where id=1;
  update public.assignments a set tasks=public.daily_tasks_for_date(a.tasks,a.date)
    where a.kind='daily' and a.date>=(now() at time zone 'Australia/Melbourne')::date
    and not exists(select 1 from public.submissions s where s.assignment_id=a.id);
end $$;
