create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 email text not null,
 endpoint_hash text not null unique,
 endpoint text not null check(length(endpoint)<=2000),
 p256dh text not null, auth text not null,
 updated_at timestamptz not null default now(), last_test_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index push_subscriptions_email_idx on public.push_subscriptions(email);
create table public.push_jobs (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 member_id uuid not null references public.members(id) on delete cascade,
 assignment_id text not null references public.assignments(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','leased','sent','cancelled','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid, leased_at timestamptz, sent_at timestamptz,
 created_at timestamptz not null default now(),
 unique(subscription_id,member_id,assignment_id)
);
create index push_jobs_pending_idx on public.push_jobs(next_attempt_at) where status in ('pending','leased');
create index push_jobs_member_idx on public.push_jobs(member_id);
create index push_jobs_assignment_idx on public.push_jobs(assignment_id);
create index push_jobs_recipient_idx on public.push_jobs(recipient_user_id);
alter table public.push_subscriptions enable row level security;
alter table public.push_jobs enable row level security;
revoke all on public.push_subscriptions,public.push_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions,public.push_jobs to service_role;

create function public.claim_push_jobs(p_limit integer) returns setof public.push_jobs
language sql security invoker set search_path='' as $$
 update public.push_jobs set status='leased',leased_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1
 where id in (
  select id from public.push_jobs
  where attempts<3 and next_attempt_at<=now()
   and (status='pending' or (status='leased' and leased_at<now()-interval '5 minutes'))
  order by next_attempt_at limit least(greatest(p_limit,0),10) for update skip locked
 ) returning *;
$$;
revoke all on function public.claim_push_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_push_jobs(integer) to service_role;
