-- Wallet top-ups through Dodo Payments. One row per checkout; the webhook
-- marks it succeeded and credits the wallet (idempotent on the payment id).
-- Requires users.sql. Writes are backend-only (service_role).

create table if not exists public.wallet_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  pack_id text not null,
  dodo_session_id text unique,
  dodo_payment_id text unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  credit_micros bigint not null check (credit_micros >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_payments_user_created_idx
  on public.wallet_payments (user_id, created_at desc);

alter table public.wallet_payments enable row level security;

drop policy if exists wallet_payments_select_own on public.wallet_payments;
create policy wallet_payments_select_own on public.wallet_payments
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.wallet_payments from anon, authenticated;
grant select on public.wallet_payments to authenticated;
