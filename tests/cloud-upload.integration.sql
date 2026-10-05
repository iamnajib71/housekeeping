-- Upload fixtures and locks are fully rolled back.
begin;
do $$
declare admin_id uuid; other_id uuid; t public.walkthrough_trials; claimed public.walkthrough_trials;
begin
  select id into admin_id from public.members where role='admin' order by position limit 1;
  select id into other_id from public.members where role='member' order by position limit 1;
  insert into public.walkthrough_trials(member_id,status,frame_times,upload_url,upload_size,video_mime)
    values(admin_id,'uploading',array[0.0]::double precision[],'https://generativelanguage.googleapis.com/upload/test',4194304,'video/mp4') returning * into t;
  begin
    perform public.claim_walkthrough_upload(t.id,other_id,0);raise exception 'Owner guard failed';
  exception when others then if sqlerrm<>'Upload session unavailable' then raise; end if; end;
  begin
    perform public.claim_walkthrough_upload(t.id,admin_id,1);raise exception 'Offset guard failed';
  exception when others then if sqlerrm<>'Upload offset does not match' then raise; end if; end;
  claimed:=public.claim_walkthrough_upload(t.id,admin_id,0);
  if claimed.upload_token is null or claimed.upload_lease_until<=now() then raise exception 'Upload lease missing'; end if;
  begin
    perform public.claim_walkthrough_upload(t.id,admin_id,0);raise exception 'Concurrent chunk guard failed';
  exception when others then if sqlerrm<>'Upload chunk is already being processed' then raise; end if; end;
  update public.walkthrough_trials set upload_offset=2097152,upload_token=null,upload_lease_until=null where id=t.id;
  claimed:=public.claim_walkthrough_upload(t.id,admin_id,2097152);
  update public.walkthrough_trials set status='processing',upload_token=null,upload_lease_until=null where id=t.id;
  begin
    perform public.claim_walkthrough_upload(t.id,admin_id,2097152);raise exception 'Finalized upload guard failed';
  exception when others then if sqlerrm<>'Upload session unavailable' then raise; end if; end;
  if has_table_privilege('authenticated','public.walkthrough_trials','SELECT')
    or has_function_privilege('authenticated','public.claim_walkthrough_upload(uuid,uuid,bigint)','EXECUTE') then raise exception 'Private upload state exposed'; end if;
end $$;
select 'Upload owner, offset, concurrency, finalized-state and browser permission guards passed' as result;
rollback;
