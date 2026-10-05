alter table public.walkthrough_trials drop constraint walkthrough_trials_status_check;
alter table public.walkthrough_trials add constraint walkthrough_trials_status_check check(status in ('analyzing','ready','failed','uploading','processing'));
alter table public.walkthrough_trials add column upload_url text, add column upload_size bigint,
  add column upload_offset bigint not null default 0, add column upload_token uuid,
  add column upload_lease_until timestamptz, add column video_mime text, add column provider_file text;

create function public.claim_walkthrough_upload(p_trial uuid,p_member uuid,p_offset bigint)
returns public.walkthrough_trials language plpgsql security invoker set search_path='' as $$
declare trial public.walkthrough_trials;
begin
  select * into trial from public.walkthrough_trials where id=p_trial and member_id=p_member for update;
  if trial.id is null or trial.status<>'uploading' or trial.created_at<now()-interval '2 hours' then raise exception 'Upload session unavailable'; end if;
  if trial.upload_lease_until>now() then raise exception 'Upload chunk is already being processed'; end if;
  if p_offset<>trial.upload_offset then raise exception 'Upload offset does not match'; end if;
  update public.walkthrough_trials set upload_token=gen_random_uuid(),upload_lease_until=clock_timestamp()+interval '90 seconds'
    where id=trial.id returning * into trial;
  return trial;
end $$;
revoke execute on function public.claim_walkthrough_upload(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.claim_walkthrough_upload(uuid,uuid,bigint) to service_role;
