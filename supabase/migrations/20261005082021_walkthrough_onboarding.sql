-- Admin-only experiments. Videos and snapshots are never stored here.
alter table public.household_settings add column cleaning_areas text[] not null
  default array['Kitchen','Oven','Stove','Toilet','Bathroom','Common Space','Lounge room','Laundry'];

create table public.walkthrough_trials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  created_at timestamptz not null default now(),
  status text not null default 'analyzing' check(status in ('analyzing','ready','failed')),
  frame_times double precision[] not null check(cardinality(frame_times) between 1 and 16),
  plan jsonb check(plan is null or jsonb_typeof(plan)='object'),
  applied_at timestamptz
);
create index walkthrough_trials_member_created_idx on public.walkthrough_trials(member_id,created_at desc);
alter table public.walkthrough_trials enable row level security;
revoke all on public.walkthrough_trials from public,anon,authenticated;
grant all on public.walkthrough_trials to service_role;

create function public.begin_walkthrough(p_member uuid,p_times double precision[])
returns public.walkthrough_trials language plpgsql security invoker set search_path='' as $$
declare trial public.walkthrough_trials;
begin
  if not exists(select 1 from public.members where id=p_member and role='admin') then raise exception 'Admin only'; end if;
  if cardinality(p_times) not between 1 and 16 or exists(select 1 from unnest(p_times) t where t<0 or t>180 or t is null) then raise exception 'Invalid snapshot times'; end if;
  perform pg_advisory_xact_lock(hashtext('walkthrough:'||p_member::text));
  if exists(select 1 from public.walkthrough_trials where member_id=p_member and created_at>now()-interval '1 minute') then
    raise exception 'Wait one minute before another analysis'; end if;
  if (select count(*) from public.walkthrough_trials where member_id=p_member and created_at>now()-interval '24 hours')>=20 then
    raise exception 'Trial limit reached: 20 analyses per 24 hours'; end if;
  insert into public.walkthrough_trials(member_id,frame_times) values(p_member,p_times) returning * into trial;
  return trial;
end $$;

create function public.apply_walkthrough(p_trial uuid,p_member uuid,p_plan jsonb,p_daily text[],p_weekly text[],p_areas text[])
returns integer language plpgsql security invoker set search_path='' as $$
declare trial public.walkthrough_trials; changed integer;
begin
  if not exists(select 1 from public.members where id=p_member and role='admin') then raise exception 'Admin only'; end if;
  select * into trial from public.walkthrough_trials where id=p_trial and member_id=p_member for update;
  if trial.id is null or trial.status<>'ready' then raise exception 'Save a ready trial before applying'; end if;
  if p_plan is null or jsonb_typeof(p_plan)<>'object' or octet_length(p_plan::text)>40000 then raise exception 'Invalid plan'; end if;
  if cardinality(p_daily) not between 1 and 30 or cardinality(p_weekly) not between 1 and 30
    or cardinality(p_areas) not between 1 and 12 or p_daily is null or p_weekly is null or p_areas is null
    or exists(select 1 from unnest(p_daily||p_weekly) t where t is null or length(trim(t))=0 or length(t)>150)
    or exists(select 1 from unnest(p_areas) t where t is null or length(trim(t))=0 or length(t)>60) then raise exception 'Invalid cleaning checklists'; end if;
  -- Match save_settings' settings-before-assignments lock order.
  perform 1 from public.household_settings where id=1 for update;
  -- Waiting for draft/upload locks makes NOT EXISTS see any newly started work.
  perform 1 from public.assignments where date>=(now() at time zone 'Australia/Melbourne')::date order by id for update;
  update public.household_settings set daily_tasks=p_daily,weekly_tasks=p_weekly,cleaning_areas=p_areas where id=1;
  update public.assignments a set tasks=case when a.kind='daily' then p_daily else p_weekly end
    where a.date>=(now() at time zone 'Australia/Melbourne')::date
      and not exists(select 1 from public.submissions s where s.assignment_id=a.id);
  get diagnostics changed=row_count;
  update public.walkthrough_trials set plan=p_plan,applied_at=clock_timestamp() where id=trial.id;
  return changed;
end $$;
revoke execute on function public.begin_walkthrough(uuid,double precision[]),public.apply_walkthrough(uuid,uuid,jsonb,text[],text[],text[]) from public,anon,authenticated;
grant execute on function public.begin_walkthrough(uuid,double precision[]),public.apply_walkthrough(uuid,uuid,jsonb,text[],text[],text[]) to service_role;
