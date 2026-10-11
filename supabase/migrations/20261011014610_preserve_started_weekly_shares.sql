alter table public.assignments add column legacy_task_split boolean not null default false;
update public.assignments a set legacy_task_split=true where a.kind='weekly'
 and exists(select 1 from public.submissions s where s.assignment_id=a.id);
