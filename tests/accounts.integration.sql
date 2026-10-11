-- Runs inside the caller's transaction; all fixture rows are rolled back.
do $$
declare owner uuid:=gen_random_uuid(); tenant uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
 h integer; other integer; admin_member uuid; invited public.tenant_invitations; before_settings jsonb; before_subs integer;
begin
 select to_jsonb(s) into before_settings from public.household_settings s where id=1;
 select count(*) into before_subs from public.submissions;
 insert into auth.users(id,email,email_confirmed_at) values(owner,'test-owner@example.invalid',now()),(tenant,'test-tenant@example.invalid',now()),(stranger,'test-other@example.invalid',now());
 h=public.create_household(owner,'test-owner@example.invalid','Account trial','1 Test Street, Melbourne VIC 3000','Trial owner',false);
 if exists(select 1 from public.assignments where household_id=h) then raise exception 'New property should be empty'; end if;
 if exists(select 1 from public.household_settings where id=h and (cardinality(daily_tasks)>0 or council_bins_enabled or reminders_enabled)) then raise exception 'New setup inherited duties or reminders'; end if;
 select id into admin_member from public.members where household_id=h;
 if not exists(select 1 from public.members where id=admin_member and role='admin' and not participates) then raise exception 'Admin-only role incorrect'; end if;
 insert into public.tenant_invitations(household_id,email,name,token_hash,created_by) values(h,'test-tenant@example.invalid','Trial tenant',repeat('a',64),admin_member) returning * into invited;
 begin perform public.accept_tenant_invitation(stranger,'test-other@example.invalid',invited.token_hash); raise exception 'Wrong email accepted'; exception when others then if sqlerrm='Wrong email accepted' then raise; end if; end;
 if public.accept_tenant_invitation(tenant,'test-tenant@example.invalid',invited.token_hash)<>h then raise exception 'Tenant joined wrong home'; end if;
 if public.accept_tenant_invitation(tenant,'test-tenant@example.invalid',invited.token_hash)<>h then raise exception 'Idempotent invitation retry failed'; end if;
 if not exists(select 1 from public.members where user_id=tenant and household_id=h and role='member' and participates and not guide_completed) then raise exception 'Tenant role incorrect'; end if;
 other=public.create_household(stranger,'test-other@example.invalid','Other home','2 Test Street, Melbourne VIC 3000','Other admin',true);
 begin insert into public.assignments(id,household_id,date,kind,member_ids,tasks) values(h||'-daily-2026-10-13',h,'2026-10-13','daily',array[(select id from public.members where household_id=other)],array['Test']); raise exception 'Cross-home assignment accepted'; exception when others then if sqlerrm='Cross-home assignment accepted' then raise; end if; end;
 perform public.save_household_settings(h,array['Kitchen: Wipe'],array['Bathroom: Clean'],19,8,21,false);
 insert into public.tenant_invitations(household_id,email,name,token_hash,created_by,expires_at) values(h,'test-other@example.invalid','Expired',repeat('b',64),admin_member,now()-interval '1 hour');
 begin perform public.accept_tenant_invitation(stranger,'test-other@example.invalid',repeat('b',64)); raise exception 'Expired invite accepted'; exception when others then if sqlerrm='Expired invite accepted' then raise; end if; end;
 insert into public.walkthrough_trials(member_id,status,frame_times,plan) values(admin_member,'ready',array[0]::double precision[],'{}'::jsonb) returning id into invited.id;
 perform public.apply_walkthrough(invited.id,admin_member,'{}'::jsonb,array['Kitchen: Quick wipe'],array['Bathroom: Deep clean'],array['Kitchen','Bathroom']);
 if (select to_jsonb(s) from public.household_settings s where id=1)<>before_settings then raise exception 'Original settings changed'; end if;
 if (select count(*) from public.submissions)<>before_subs then raise exception 'Original submissions changed'; end if;
 if has_table_privilege('authenticated','public.households','select') or has_table_privilege('authenticated','public.tenant_invitations','select') or has_function_privilege('authenticated','public.create_household(uuid,text,text,text,text,boolean)','execute') then raise exception 'Browser has private privileges'; end if;
end $$;
select set_config('test.signup_user',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.signup_user')::uuid,'test-service@example.invalid',now());
set local role service_role;
select public.create_household(current_setting('test.signup_user')::uuid,'test-service@example.invalid','Service role trial','3 Test Street, Melbourne VIC 3000','Trial',true);
reset role;
