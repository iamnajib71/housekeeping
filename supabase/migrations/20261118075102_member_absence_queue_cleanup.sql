-- Preserve every existing date and receipt. Reject incomplete replacement rosters.
create or replace function public.set_member_absence(
 p_household integer,p_member uuid,p_from date,p_until date,p_effective date,
 p_pool jsonb,p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 today date := (now() at time zone 'Australia/Melbourne')::date;
 actual_pool jsonb;
 item record;
 changed integer := 0;
 affected integer;
 protected integer;
begin
 -- Serialize availability edits and reject a stale household snapshot.
 perform 1 from public.households where id=p_household for update;
 if not found then raise exception 'Household not found'; end if;
 select jsonb_agg(jsonb_build_object('id',id,'position',position,'participates',participates,'away_from',away_from,'away_until',away_until) order by id)
 into actual_pool from public.members where household_id=p_household;
 if actual_pool is distinct from p_pool then raise exception 'The household changed. Refresh and try again.'; end if;
 if p_effective<today or p_effective>today+365 then raise exception 'Invalid roster update date'; end if;
 if p_from is not null and p_until is null and p_from<>p_effective then raise exception 'Invalid absence start'; end if;
 if p_until is not null and p_until<>today then raise exception 'Mark back using today''s date'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>400 then raise exception 'Invalid roster'; end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) as x(id text,date date,kind text,member_ids uuid[],tasks text[])
  where x.date<p_effective or x.date>today+365 or x.kind not in ('daily','weekly')
  or x.id<>case when p_household=1 then '' else p_household::text||'-' end||x.kind||'-'||x.date::text
  or cardinality(x.member_ids)<>case when x.kind='daily' then 1 else 2 end)
 then raise exception 'Invalid roster assignments'; end if;
 -- Never delete dates or receipts when an absence leaves an unstaffed turn.
 if exists(select 1 from public.assignments a where household_id=p_household and date>=p_effective
 and not exists(select 1 from public.submissions s where s.assignment_id=a.id)
 and not exists(select 1 from jsonb_array_elements(p_rows) x where x->>'id'=a.id))
 then raise exception 'Not enough available tenants to cover an existing turn. Review the roster first.'; end if;
 update public.members set away_from=p_from,away_until=p_until
 where id=p_member and household_id=p_household and participates;
 if not found then raise exception 'Tenant not found in this home'; end if;
 select count(*) into protected from public.assignments a
 where a.household_id=p_household and a.date>=p_effective and p_member=any(a.member_ids)
 and exists(select 1 from public.submissions s where s.assignment_id=a.id);
 for item in select * from jsonb_to_recordset(p_rows) as x(id text,date date,kind text,member_ids uuid[],tasks text[]) loop
  insert into public.assignments as a(id,household_id,date,kind,member_ids,tasks)
  values(item.id,p_household,item.date,item.kind,item.member_ids,item.tasks)
  on conflict(id) do update set member_ids=excluded.member_ids
  where a.household_id=p_household and a.date>=p_effective
  and a.member_ids is distinct from excluded.member_ids
  and not exists(select 1 from public.submissions s where s.assignment_id=a.id);
  get diagnostics affected=row_count;
  if affected>0 then
   changed:=changed+affected;
   update public.email_jobs set status='cancelled' where assignment_id=item.id and status in ('pending','leased');
   update public.push_jobs set status='cancelled' where assignment_id=item.id and status in ('pending','leased');
  end if;
 end loop;
 return jsonb_build_object('changed',changed,'protected',protected);
end $$;
