-- Optional cloud account. A row exists only after the user taps
-- "Connect Google"; the app works fully without one.
-- Apply order: users.sql → wallet.sql → folders.sql.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (name is null or char_length(name) <= 120),
  age smallint check (age is null or age between 1 and 120),
  gender text check (gender is null or char_length(gender) <= 40),
  email text,
  phone_number text check (phone_number is null or char_length(phone_number) <= 32),
  -- Client-writable (occupation, onboarding goal, …). Never store privileged flags here.
  metadata jsonb not null default '{}'::jsonb,
  -- The user's own choice to store data in the cloud. Off until they turn it on;
  -- connecting Google alone never enables it.
  cloud_sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Rows are created by the auth.users trigger (wallet.sql) and removed by the
-- auth cascade, so clients get no insert/delete. Column grants keep id, email
-- and timestamps out of the client's reach.
revoke insert, update, delete on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (name, age, gender, phone_number, metadata, cloud_sync_enabled)
  on public.users to authenticated;
