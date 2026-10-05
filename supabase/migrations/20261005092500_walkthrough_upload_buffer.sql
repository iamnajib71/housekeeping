-- Server-only, private staging of at most one Google upload chunk per trial.
-- No browser Storage policies are granted for this bucket.
alter table public.walkthrough_trials add column buffer_cleaned_at timestamptz;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('walkthrough-buffer','walkthrough-buffer',false,2097152,array['application/octet-stream'])
on conflict(id) do nothing;
