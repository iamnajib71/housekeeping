create index households_owner_created_idx on public.households(owner_id,created_at);
create index members_login_email_idx on public.members(email) where email is not null;
