alter table public.photos
  alter column expires_at set default now() + interval '15 days';

update public.photos
set expires_at = created_at + interval '15 days'
where deleted_at is null;
