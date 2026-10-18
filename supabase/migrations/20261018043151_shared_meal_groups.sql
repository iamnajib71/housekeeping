-- Meal groups are private to their named members. Browser roles have no direct
-- table privileges; authenticated server routes scope every operation to a home
-- and group membership. State updates use a version compare-and-swap.
create table public.meal_groups (
 id uuid primary key default gen_random_uuid(),
 household_id integer not null references public.households(id),
 name text not null check(length(trim(name)) between 1 and 60),
 member_ids uuid[] not null check(cardinality(member_ids) between 2 and 12),
 created_by uuid not null references public.members(id),
 created_at timestamptz not null default now(),
 version integer not null default 0 check(version>=0),
 state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=1000000)
);
create index meal_groups_home_idx on public.meal_groups(household_id);
create unique index meal_groups_name_idx on public.meal_groups(household_id,lower(name));
create function public.check_meal_group_members() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not(new.created_by=any(new.member_ids)) or cardinality(new.member_ids)<>(select count(distinct id) from public.members where household_id=new.household_id and id=any(new.member_ids)) then
  raise exception 'Choose distinct members of the same property, including the creator';
 end if;
 return new;
end $$;
create trigger meal_group_members before insert or update of member_ids,household_id,created_by on public.meal_groups for each row execute function public.check_meal_group_members();
revoke execute on function public.check_meal_group_members() from public,anon,authenticated;
grant execute on function public.check_meal_group_members() to service_role;

create table public.meal_notice_jobs (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.meal_groups(id) on delete cascade,
 member_id uuid not null references public.members(id),
 dedupe_key text not null unique,
 notice_key text not null,
 channel text not null check(channel in ('email','push')),
 status text not null default 'pending' check(status in ('pending','leased','sent','cancelled','failed')),
 lease_token uuid,leased_at timestamptz,sent_at timestamptz,
 attempts integer not null default 0,created_at timestamptz not null default now()
);
create index meal_notices_group_idx on public.meal_notice_jobs(group_id);
create index meal_notices_member_idx on public.meal_notice_jobs(member_id);
create index meal_notices_pending_idx on public.meal_notice_jobs(channel,created_at) where status in ('pending','leased');
alter table public.meal_groups enable row level security;
alter table public.meal_notice_jobs enable row level security;
revoke all on public.meal_groups,public.meal_notice_jobs from anon,authenticated;
grant select,insert,update,delete on public.meal_groups,public.meal_notice_jobs to service_role;
create function public.claim_meal_notices(p_channel text,p_limit integer) returns setof public.meal_notice_jobs language sql security invoker set search_path='' as $$
 update public.meal_notice_jobs set status='leased',lease_token=gen_random_uuid(),leased_at=now(),attempts=attempts+1
 where id in (
  select id from public.meal_notice_jobs where channel=p_channel and attempts<4
  and (status='pending' or (status='leased' and leased_at<now()-interval '5 minutes'))
  order by created_at limit greatest(0,least(p_limit,10)) for update skip locked
 ) returning *;
$$;
revoke execute on function public.claim_meal_notices(text,integer) from public,anon,authenticated;
grant execute on function public.claim_meal_notices(text,integer) to service_role;
