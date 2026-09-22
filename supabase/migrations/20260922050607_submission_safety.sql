-- Backward-compatible additions: existing clients keep working during promotion.
create function public.save_draft(p_assignment text,p_member uuid,p_tasks text[],p_notes text)
returns public.submissions language plpgsql security invoker set search_path='' as $$
declare a public.assignments; s public.submissions;
begin
 select * into a from public.assignments where id=p_assignment for update;
 if a.id is null or not(p_member=any(a.member_ids)) then raise exception 'Not assigned'; end if;
 if a.date>(now() at time zone 'Australia/Melbourne')::date then raise exception 'Drafts open on the cleaning date'; end if;
 if not(p_tasks <@ a.tasks) or cardinality(p_tasks)>30 then raise exception 'Invalid tasks'; end if;
 insert into public.submissions(assignment_id,member_id) values(p_assignment,p_member) on conflict(assignment_id,member_id) do nothing;
 select * into s from public.submissions where assignment_id=p_assignment and member_id=p_member for update;
 if s.status not in ('draft','rework') then raise exception 'This submission is locked'; end if;
 update public.submissions set tasks=p_tasks,notes=p_notes where id=s.id returning * into s;
 return s;
end $$;
create function public.retire_photo(p_assignment text,p_member uuid,p_photo uuid)
returns public.photos language plpgsql security invoker set search_path='' as $$
declare a public.assignments; s public.submissions; p public.photos;
begin
 select * into a from public.assignments where id=p_assignment for update;
 if a.id is null or not(p_member=any(a.member_ids)) then raise exception 'Not assigned'; end if;
 select * into s from public.submissions where assignment_id=p_assignment and member_id=p_member for update;
 if s.id is null or s.status not in ('draft','rework') then raise exception 'Submitted photos cannot be removed'; end if;
 -- Expiry immediately prevents this photo being counted as submission evidence.
 -- Physical deletion follows through Storage API and retries during cleanup.
 update public.photos set expires_at=now() where id=p_photo and submission_id=s.id and deleted_at is null returning * into p;
 if p.id is null then raise exception 'Photo not found'; end if;
 return p;
end $$;
create function public.review_clean(p_submission uuid,p_status text,p_note text)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.submissions;
begin
 if p_status not in ('approved','rework') or (p_status='rework' and length(trim(p_note))=0) then raise exception 'Invalid review'; end if;
 update public.submissions set status=p_status,review_note=p_note where id=p_submission and status='submitted' returning * into s;
 if s.id is null then raise exception 'This submission has already been reviewed'; end if;
 if p_status='rework' then
 insert into public.email_jobs(dedupe_key,member_id,assignment_id,kind)
 values('rework:'||s.id::text||':'||s.submitted_at::text,s.member_id,s.assignment_id,'rework') on conflict(dedupe_key) do nothing;
 end if;
end $$;
revoke execute on function public.save_draft(text,uuid,text[],text),public.retire_photo(text,uuid,uuid),public.review_clean(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_draft(text,uuid,text[],text),public.retire_photo(text,uuid,uuid),public.review_clean(uuid,text,text) to service_role;
