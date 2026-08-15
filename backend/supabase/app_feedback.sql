create extension if not exists pgcrypto;

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null check (category in ('bug', 'suggestion', 'transcription', 'experience', 'other')),
  message text not null check (char_length(message) between 10 and 4000),
  rating smallint check (rating between 1 and 5),
  email text,
  app_version text,
  platform text not null default 'unknown' check (platform in ('android', 'ios', 'web', 'unknown')),
  platform_version text
);

alter table public.app_feedback enable row level security;

-- No public policies are intentional. Inserts go through the backend with the
-- Supabase secret key, while mobile clients receive no direct table access.

create index if not exists app_feedback_created_at_idx
  on public.app_feedback (created_at desc);

create index if not exists app_feedback_category_idx
  on public.app_feedback (category, created_at desc);
