-- Google Calendar + Meet connection per account. Holds the encrypted Google
-- refresh token, so only the backend (service_role) may read or write it.
-- The app learns the connection status through /v1/me/google/status.
-- Requires users.sql.

create table if not exists public.google_connections (
  user_id uuid primary key references public.users (id) on delete cascade,
  google_email text,
  scopes text[] not null default '{}',
  -- AES-256-GCM "iv:tag:ciphertext" (base64), key in GOOGLE_TOKEN_ENCRYPTION_KEY.
  refresh_token_ciphertext text not null,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists google_connections_set_updated_at on public.google_connections;
create trigger google_connections_set_updated_at
  before update on public.google_connections
  for each row execute function public.set_updated_at();

-- RLS on with no policies: clients can never see the token, even their own.
alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;
