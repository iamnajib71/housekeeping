-- Run inside BEGIN/ROLLBACK. Never leaves a test user, device or job behind.
do $$
declare u uuid:=gen_random_uuid(); d uuid; m uuid; a text; j public.push_jobs; token uuid;
begin
 if exists(select 1 from public.push_jobs where status in ('pending','leased')) then raise exception 'Run queue fixture test only with no active production jobs'; end if;
 select id,member_ids[1] into a,m from public.assignments where cardinality(member_ids)>0 limit 1;
 if a is null then raise exception 'No assignment available for rolled-back fixture'; end if;
 insert into auth.users(id,email,email_confirmed_at) values(u,'test-push@example.invalid',now());
 insert into public.push_subscriptions(user_id,email,endpoint_hash,endpoint,p256dh,auth) values(u,'test-push@example.invalid',gen_random_uuid()::text,'https://fcm.googleapis.com/fcm/send/rolled-back-test','fixture','fixture') returning id into d;
 insert into public.push_jobs(subscription_id,member_id,assignment_id,recipient_user_id) values(d,m,a,u);
 insert into public.push_jobs(subscription_id,member_id,assignment_id,recipient_user_id) values(d,m,a,u) on conflict(subscription_id,member_id,assignment_id) do nothing;
 if (select count(*) from public.push_jobs where subscription_id=d)<>1 then raise exception 'Deduplication failed'; end if;
 if exists(select 1 from public.claim_push_jobs(0)) then raise exception 'Zero limit claimed work'; end if;
 select * into j from public.claim_push_jobs(1);
 if j.subscription_id<>d or j.attempts<>1 or j.lease_token is null then raise exception 'First lease failed'; end if;
 token=j.lease_token;
 if exists(select 1 from public.claim_push_jobs(1)) then raise exception 'Concurrent poll reclaimed active lease'; end if;
 update public.push_jobs set leased_at=now()-interval '6 minutes' where id=j.id;
 select * into j from public.claim_push_jobs(1);
 if j.attempts<>2 or j.lease_token=token then raise exception 'Stale lease recovery failed'; end if;
 update public.push_jobs set leased_at=now()-interval '6 minutes' where id=j.id;
 select * into j from public.claim_push_jobs(1);
 if j.attempts<>3 then raise exception 'Third attempt missing'; end if;
 update public.push_jobs set leased_at=now()-interval '6 minutes' where id=j.id;
 if exists(select 1 from public.claim_push_jobs(1)) then raise exception 'Retry cap failed'; end if;
 if has_table_privilege('authenticated','public.push_subscriptions','select') or has_table_privilege('anon','public.push_jobs','select') or has_function_privilege('authenticated','public.claim_push_jobs(integer)','execute') then raise exception 'Browser has private push privileges'; end if;
end $$;
