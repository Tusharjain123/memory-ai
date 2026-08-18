create table if not exists public.processing_results (
  job_id uuid primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payload jsonb not null
);

alter table public.processing_results enable row level security;

-- No public policies are intentional. The backend writes and reads rows with
-- the Supabase secret key. Mobile clients never access this table directly.
-- Rows are a short-lived handoff until /process/status delivers the result.

create index if not exists processing_results_expires_at_idx
  on public.processing_results (expires_at);
