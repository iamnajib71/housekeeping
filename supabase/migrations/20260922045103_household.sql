-- Server-only data: verified Google session + roster membership on every API call.
-- Browser roles have no data privileges. RLS provides deny-by-default protection.
create table public.members (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 40),
 email text unique check(email is null or email=lower(email)), role text not null default 'member' check(role in ('admin','member')),
 position smallint not null unique check(position between 0 and 5), color text not null, created_at timestamptz not null default now()
);
create table public.household_settings (
 id integer primary key check(id=1), timezone text not null default 'Australia/Melbourne' check(timezone='Australia/Melbourne'),
 daily_start date not null default '2026-09-27', weekly_start date not null default '2026-10-05',
 daily_tasks text[] not null, weekly_tasks text[] not null,
 evening_hour smallint not null default 19 check(evening_hour between 0 and 23),
 morning_hour smallint not null default 8 check(morning_hour between 0 and 23),
 deadline_hour smallint not null default 21 check(deadline_hour between 0 and 23),
 reminders_enabled boolean not null default true, check(morning_hour<deadline_hour)
);
create table public.assignments (
 id text primary key, date date not null unique, kind text not null check(kind in ('daily','weekly')),
 member_ids uuid[] not null, tasks text[] not null,
 check((kind='daily' and cardinality(member_ids)=1) or (kind='weekly' and cardinality(member_ids)=2))
);
create table public.submissions (
 id uuid primary key default gen_random_uuid(), assignment_id text not null references public.assignments(id),
 member_id uuid not null references public.members(id), tasks text[] not null default '{}', notes text not null default '' check(length(notes)<=2000),
 status text not null default 'draft' check(status in ('draft','submitted','approved','rework')),
 submitted_at timestamptz, review_note text not null default '' check(length(review_note)<=1000),
 created_at timestamptz not null default now(), unique(assignment_id,member_id)
);
create index submissions_member_idx on public.submissions(member_id);
create table public.photos (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.submissions(id),
 path text not null unique, uploaded boolean not null default false,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days', deleted_at timestamptz
);
create index photos_submission_idx on public.photos(submission_id);
create index photos_expiry_idx on public.photos(expires_at) where deleted_at is null;
create table public.email_jobs (
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
 member_id uuid not null references public.members(id), assignment_id text not null references public.assignments(id),
 kind text not null check(kind in ('tomorrow','today','overdue','rework')),
 status text not null default 'pending' check(status in ('pending','leased','sent','cancelled')),
 lease_token uuid, leased_at timestamptz, sent_at timestamptz, created_at timestamptz not null default now()
);
create index email_jobs_pending_idx on public.email_jobs(created_at) where status in ('pending','leased');
create index email_jobs_member_idx on public.email_jobs(member_id);
create index email_jobs_assignment_idx on public.email_jobs(assignment_id);
create table public.worker_health(id integer primary key check(id=1),last_run timestamptz,last_error text);
insert into public.worker_health(id) values(1);
insert into public.household_settings(id,daily_tasks,weekly_tasks) values(1,
 array['Wipe kitchen benches and surfaces','Clean the stovetop and the areas beside it','Remove unnecessary items from the kitchen','Wash dishes and clear the sink','Empty the bin when it is over 80% full','Check for dirt and sweep or wipe as needed'],
 array['Kitchen','Oven','Stove','Toilet','Bathroom','Common Space','Lounge room','Laundry']);
-- Email addresses are private production data and are configured outside
-- version control. A fresh install denies all Google accounts until an admin
-- deliberately adds the approved roster in Supabase.
insert into public.members(name,email,role,position,color) values
 ('Najib',null,'admin',0,'#dce9ff'),
 ('Shawon',null,'member',1,'#f9e2c7'),
 ('Nasif',null,'member',2,'#e6defa'),
 ('Siam',null,'member',3,'#d8eee6'),
 ('Ratul',null,'member',4,'#f8dfe4'),
 ('Zarif',null,'member',5,'#e4e9ef');
alter table public.members enable row level security;
alter table public.household_settings enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.photos enable row level security;
alter table public.email_jobs enable row level security;
alter table public.worker_health enable row level security;
revoke all on public.members,public.household_settings,public.assignments,public.submissions,public.photos,public.email_jobs,public.worker_health from anon,authenticated;
grant select,insert,update,delete on public.members,public.household_settings,public.assignments,public.submissions,public.photos,public.email_jobs,public.worker_health to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cleaning-proof','cleaning-proof',false,1048576,array['image/jpeg']);
-- Invoker RPCs restricted to the server role; browser roles cannot call them.
create function public.reserve_photo(p_assignment text,p_member uuid)
returns public.photos language plpgsql security invoker set search_path='' as $$
declare a public.assignments; s public.submissions; p public.photos; photo_id uuid:=gen_random_uuid();
begin
 select * into a from public.assignments where id=p_assignment for update;
 if a.id is null or not(p_member=any(a.member_ids)) then raise exception 'Not assigned'; end if;
 if a.date>(now() at time zone 'Australia/Melbourne')::date then raise exception 'Uploads open on the cleaning date'; end if;
 insert into public.submissions(assignment_id,member_id) values(p_assignment,p_member) on conflict(assignment_id,member_id) do nothing;
 select * into s from public.submissions where assignment_id=p_assignment and member_id=p_member for update;
 if s.status not in ('draft','rework') then raise exception 'This submission is locked'; end if;
 if(select count(*) from public.photos where submission_id=s.id and deleted_at is null)>=10 then raise exception 'Maximum 10 photos'; end if;
 insert into public.photos(id,submission_id,path) values(photo_id,s.id,p_member::text||'/'||s.id::text||'/'||photo_id::text||'.jpg') returning * into p;
 return p;
end $$;
create function public.submit_clean(p_assignment text,p_member uuid,p_tasks text[],p_notes text)
returns public.submissions language plpgsql security invoker set search_path='' as $$
declare a public.assignments; s public.submissions;
begin
 select * into a from public.assignments where id=p_assignment for update;
 if a.id is null or not(p_member=any(a.member_ids)) then raise exception 'Not assigned'; end if;
 if a.date>(now() at time zone 'Australia/Melbourne')::date then raise exception 'Submission opens on the cleaning date'; end if;
 if cardinality(p_tasks)<1 or cardinality(p_tasks)>30 or not(p_tasks <@ a.tasks) then raise exception 'Choose valid tasks'; end if;
 select * into s from public.submissions where assignment_id=p_assignment and member_id=p_member for update;
 if s.id is null or s.status not in ('draft','rework') then raise exception 'Upload proof before submitting, or check submission status'; end if;
 if not exists(select 1 from public.photos where submission_id=s.id and uploaded and deleted_at is null and expires_at>now()) then raise exception 'At least one unexpired photo is required'; end if;
 update public.submissions set tasks=p_tasks,notes=p_notes,status='submitted',submitted_at=now(),review_note='' where id=s.id returning * into s;
 return s;
end $$;
create function public.claim_emails(p_limit integer default 10)
returns setof public.email_jobs language sql security invoker set search_path='' as $$
 update public.email_jobs set status='leased',leased_at=now(),lease_token=gen_random_uuid()
 where id in(select id from public.email_jobs where status='pending' or (status='leased' and leased_at<now()-interval '30 minutes')
 order by created_at limit least(greatest(p_limit,0),10) for update skip locked) returning *;
$$;
create function public.save_settings(p_daily text[],p_weekly text[],p_evening integer,p_morning integer,p_deadline integer,p_enabled boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.household_settings set daily_tasks=p_daily,weekly_tasks=p_weekly,evening_hour=p_evening,morning_hour=p_morning,deadline_hour=p_deadline,reminders_enabled=p_enabled where id=1;
 update public.assignments a set tasks=case when a.kind='daily' then p_daily else p_weekly end
 where a.date>(now() at time zone 'Australia/Melbourne')::date and not exists(select 1 from public.submissions s where s.assignment_id=a.id);
end $$;
create function public.reassign_clean(p_assignment text,p_members uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare a public.assignments;
begin
 select * into a from public.assignments where id=p_assignment for update;
 if a.id is null then raise exception 'Assignment not found'; end if;
 if a.date<=(now() at time zone 'Australia/Melbourne')::date then raise exception 'Only future assignments can be reassigned'; end if;
 if exists(select 1 from public.submissions where assignment_id=a.id) then raise exception 'This clean has already started'; end if;
 if cardinality(p_members)<>(case when a.kind='daily' then 1 else 2 end)
 or(select count(distinct id) from public.members where id=any(p_members))<>cardinality(p_members) then raise exception 'Choose different members'; end if;
 update public.assignments set member_ids=p_members where id=p_assignment;
 update public.email_jobs set status='cancelled' where assignment_id=p_assignment and status in ('pending','leased');
end $$;
revoke execute on function public.reserve_photo(text,uuid),public.submit_clean(text,uuid,text[],text),public.claim_emails(integer),public.save_settings(text[],text[],integer,integer,integer,boolean),public.reassign_clean(text,uuid[]) from public,anon,authenticated;
grant execute on function public.reserve_photo(text,uuid),public.submit_clean(text,uuid,text[],text),public.claim_emails(integer),public.save_settings(text[],text[],integer,integer,integer,boolean),public.reassign_clean(text,uuid[]) to service_role;
