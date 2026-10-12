-- Cloud mirror of on-device folders. Folders are created locally (no account
-- needed) and pushed here only while users.cloud_sync_enabled is true.
-- Requires users.sql.

create table if not exists public.folders (
  -- Generated on the device so local and cloud ids match.
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  -- Tombstone so an offline delete reaches the cloud.
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists folders_user_live_name_idx
  on public.folders (user_id, lower(name))
  where deleted_at is null;

create index if not exists folders_user_server_updated_idx
  on public.folders (user_id, server_updated_at);

create table if not exists public.folder_recordings (
  folder_id uuid not null,
  user_id uuid not null default auth.uid(),
  -- Local conversation id. Recordings stay on the device, so there is no
  -- foreign key to a cloud recording table.
  conversation_id uuid not null,
  added_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (folder_id, conversation_id),
  -- Composite key: a link can never point at another user's folder.
  foreign key (folder_id, user_id)
    references public.folders (id, user_id) on delete cascade
);

create index if not exists folder_recordings_user_server_updated_idx
  on public.folder_recordings (user_id, server_updated_at);

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

drop trigger if exists folders_set_server_updated_at on public.folders;
create trigger folders_set_server_updated_at
  before insert or update on public.folders
  for each row execute function public.set_server_updated_at();

drop trigger if exists folder_recordings_set_server_updated_at on public.folder_recordings;
create trigger folder_recordings_set_server_updated_at
  before insert or update on public.folder_recordings
  for each row execute function public.set_server_updated_at();

-- True when the calling user has opted in to cloud storage.
create or replace function public.cloud_sync_enabled_for_me()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.cloud_sync_enabled from public.users u where u.id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.cloud_sync_enabled_for_me() from public, anon;
grant execute on function public.cloud_sync_enabled_for_me() to authenticated;

alter table public.folders enable row level security;
alter table public.folder_recordings enable row level security;

-- Read and delete are always allowed on own rows, so "delete my cloud copy"
-- works after sync is turned off. Writes require the opt-in.
drop policy if exists folders_select_own on public.folders;
create policy folders_select_own on public.folders
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists folders_insert_own on public.folders;
create policy folders_insert_own on public.folders
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.cloud_sync_enabled_for_me()));

drop policy if exists folders_update_own on public.folders;
create policy folders_update_own on public.folders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.cloud_sync_enabled_for_me()));

drop policy if exists folders_delete_own on public.folders;
create policy folders_delete_own on public.folders
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists folder_recordings_select_own on public.folder_recordings;
create policy folder_recordings_select_own on public.folder_recordings
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists folder_recordings_insert_own on public.folder_recordings;
create policy folder_recordings_insert_own on public.folder_recordings
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.cloud_sync_enabled_for_me()));

drop policy if exists folder_recordings_update_own on public.folder_recordings;
create policy folder_recordings_update_own on public.folder_recordings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.cloud_sync_enabled_for_me()));

drop policy if exists folder_recordings_delete_own on public.folder_recordings;
create policy folder_recordings_delete_own on public.folder_recordings
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.folders, public.folder_recordings from anon;
grant select, insert, update, delete on public.folders, public.folder_recordings to authenticated;
