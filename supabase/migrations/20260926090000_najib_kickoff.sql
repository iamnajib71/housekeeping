do $$
begin
  if exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where a.date >= date '2026-09-27'
  ) then
    raise exception 'Cannot move the roster start after submissions exist';
  end if;
end $$;

update public.household_settings
set daily_start = date '2026-09-27'
where id = 1;

insert into public.assignments(id,date,kind,member_ids,tasks)
select 'daily-2026-09-27', date '2026-09-27', 'daily',
       array[(select id from public.members order by position limit 1)],
       daily_tasks
from public.household_settings
where id = 1
on conflict (id) do update
set member_ids = excluded.member_ids,
    tasks = excluded.tasks;

update public.assignments a
set member_ids = array[(
  select m.id
  from public.members m
  where m.position = (((extract(isodow from a.date)::integer - 2) - ((a.date - date '2026-09-21') / 7)) % 6 + 6) % 6
)]
where a.kind = 'daily'
  and a.date >= date '2026-09-29';