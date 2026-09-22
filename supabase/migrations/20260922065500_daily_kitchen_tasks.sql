update public.household_settings
set daily_tasks = array['Wipe kitchen benches and surfaces','Clean the stovetop and the areas beside it','Remove unnecessary items from the kitchen','Wash dishes and clear the sink','Empty the bin when it is over 80% full','Check for dirt and sweep or wipe as needed']
where id = 1;

update public.assignments a
set tasks = array['Wipe kitchen benches and surfaces','Clean the stovetop and the areas beside it','Remove unnecessary items from the kitchen','Wash dishes and clear the sink','Empty the bin when it is over 80% full','Check for dirt and sweep or wipe as needed']
where a.kind = 'daily'
  and a.date >= date '2026-09-29'
  and not exists (select 1 from public.submissions s where s.assignment_id = a.id);