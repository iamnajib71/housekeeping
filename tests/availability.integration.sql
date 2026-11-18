-- Transaction-only fixtures: no private household changes or notifications.
begin;
do $$
declare
 h integer; a uuid; b uuid; c uuid; today date:=(now() at time zone 'Australia/Melbourne')::date;
 pool jsonb; rows jsonb; result jsonb; first_id text; protected_id text; blocked boolean:=false;
begin
 if has_function_privilege('anon','public.set_member_absence(integer,uuid,date,date,date,jsonb,jsonb)','execute')
 or has_function_privilege('authenticated','public.set_member_absence(integer,uuid,date,date,date,jsonb,jsonb)','execute')
 then raise exception 'Availability RPC must be service-only'; end if;
 insert into public.households(name,address) values('Absence regression fixture','Fictional') returning id into h;
 insert into public.members(name,position,color,household_id) values('Away fixture',0,'#eee',h) returning id into a;
 insert into public.members(name,position,color,household_id) values('Cover fixture',1,'#eee',h) returning id into b;
 insert into public.members(name,position,color,household_id) values('Other fixture',2,'#eee',h) returning id into c;
 first_id:=h||'-daily-'||(today+2);protected_id:=h||'-daily-'||(today+3);
 insert into public.assignments(id,household_id,date,kind,member_ids,tasks) values
 (first_id,h,today+2,'daily',array[a],array['Kitchen']),
 (protected_id,h,today+3,'daily',array[a],array['Kitchen']);
 insert into public.submissions(assignment_id,member_id,tasks,status) values(protected_id,a,array['Kitchen'],'draft');
 insert into public.email_jobs(dedupe_key,assignment_id,member_id,kind) values(first_id,first_id,a,'today');
 select jsonb_agg(jsonb_build_object('id',id,'position',position,'participates',participates,'away_from',away_from,'away_until',away_until) order by id)
 into pool from public.members where household_id=h;
 rows:=jsonb_build_array(
  jsonb_build_object('id',first_id,'date',today+2,'kind','daily','member_ids',array[b],'tasks',array['Kitchen']),
  jsonb_build_object('id',protected_id,'date',today+3,'kind','daily','member_ids',array[c],'tasks',array['Kitchen']));
 result:=public.set_member_absence(h,a,today+2,null,today+2,pool,rows);
 if result->>'protected'<>'1' then raise exception 'Started assignment not reported'; end if;
 if (select member_ids from public.assignments where id=first_id)<>array[b] then raise exception 'Future duty not moved'; end if;
 if (select member_ids from public.assignments where id=protected_id)<>array[a] then raise exception 'Started work overwritten'; end if;
 if (select status from public.email_jobs where dedupe_key=first_id)<>'cancelled' then raise exception 'Old-owner email not cancelled'; end if;
 begin
  perform public.set_member_absence(h,a,today+2,null,today+2,pool,rows);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Stale update accepted'; end if;
 blocked:=false;
 begin
  update public.assignments set member_ids=array[a] where id=first_id;
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Unavailable manual assignee accepted'; end if;
 select jsonb_agg(jsonb_build_object('id',id,'position',position,'participates',participates,'away_from',away_from,'away_until',away_until) order by id)
 into pool from public.members where household_id=h;
 blocked:=false;
 begin
  perform public.set_member_absence(h,gen_random_uuid(),today+2,null,today+2,pool,rows);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Tenant outside household accepted'; end if;
 -- Cancel a future absence, returning the member to the available pool.
 perform public.set_member_absence(h,a,null,null,today,pool,rows);
 if (select away_from from public.members where id=a) is not null then raise exception 'Absence not cancelled'; end if;
 select jsonb_agg(jsonb_build_object('id',id,'position',position,'participates',participates,'away_from',away_from,'away_until',away_until) order by id)
 into pool from public.members where household_id=h;
 blocked:=false;
 begin
  perform public.set_member_absence(h,a,today+2,null,today+2,pool,'[]'::jsonb);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Incomplete replacement roster accepted'; end if;
 if (select count(*) from public.assignments where household_id=h)<>2 then raise exception 'A date was deleted'; end if;
 if (select away_from from public.members where id=a) is not null then raise exception 'Incomplete update did not roll back'; end if;
end $$;
rollback;
