-- Add an explicit indoor bin change to configured homes and upcoming Mondays.
-- Preserve every historical, started, drafted or submitted checklist.
do $$
declare
  today date := (now() at time zone 'Australia/Melbourne')::date;
  bin_task text := 'Bins: Empty household bins, replace liners and wipe dirty lids';
begin
  perform 1 from public.household_settings order by id for update;
  perform 1 from public.assignments where kind='weekly' and date>=today order by id for update;

  update public.household_settings h
  set weekly_tasks=array_append(h.weekly_tasks,bin_task),
      cleaning_areas=array_append(coalesce(h.cleaning_areas,'{}'::text[]),'Bins')
  where cardinality(h.weekly_tasks)>0
    and not exists(select 1 from unnest(h.weekly_tasks) task where task ~* '\mbins?\M|\mliners?\M' and task !~* 'collection|Tuesday');

  update public.assignments a set tasks=array_append(a.tasks,bin_task)
  where a.kind='weekly' and a.date>=today and cardinality(a.tasks)>0
    and not exists(select 1 from public.submissions s where s.assignment_id=a.id)
    and not exists(select 1 from unnest(a.tasks) task where task ~* '\mbins?\M|\mliners?\M' and task !~* 'collection|Tuesday');
end $$;
