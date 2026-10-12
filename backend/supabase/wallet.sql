-- Credits wallet: one balance row per user plus an append-only ledger.
-- Amounts are integer micro-USD (1 USD = 1,000,000); new accounts get $5.00.
-- Balances change only through apply_credit_transaction(), which only the
-- backend (service_role) may execute. Clients can read their own rows.
-- Requires users.sql.

create extension if not exists pgcrypto;

do $$
begin
  create type public.credit_reason as enum (
    'signup_bonus',
    'top_up',
    'processing_charge',
    'refund',
    'adjustment'
  );
exception
  when duplicate_object then null;
end;
$$;

-- AI processing reserves its estimated cost, then releases what it didn't use.
alter type public.credit_reason add value if not exists 'processing_hold';
alter type public.credit_reason add value if not exists 'processing_release';

create table if not exists public.user_balance (
  user_id uuid primary key references public.users (id) on delete cascade,
  credits bigint not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount bigint not null check (amount <> 0),
  reason public.credit_reason not null,
  -- e.g. "top_up:<payment id>" or "processing:<job id>"; retries are no-ops.
  idempotency_key text not null unique,
  balance_after bigint not null check (balance_after >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);

alter table public.user_balance enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists user_balance_select_own on public.user_balance;
create policy user_balance_select_own on public.user_balance
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own on public.credit_transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.user_balance from anon, authenticated;
revoke insert, update, delete on public.credit_transactions from anon, authenticated;
grant select on public.user_balance, public.credit_transactions to authenticated;

create or replace function public.apply_credit_transaction(
  p_user_id uuid,
  p_amount bigint,
  p_reason public.credit_reason,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credits bigint;
  v_existing public.credit_transactions;
  v_result public.credit_transactions;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'missing_idempotency_key' using errcode = 'P0001';
  end if;

  -- Lock first so concurrent calls for one user (and retries of one key) serialize.
  select credits into v_credits
  from public.user_balance
  where user_id = p_user_id
  for update;
  if not found then
    raise exception 'user_balance_not_found' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.credit_transactions
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id = p_user_id
      and v_existing.amount = p_amount
      and v_existing.reason = p_reason then
      return v_existing;
    end if;
    raise exception 'idempotency_conflict' using errcode = 'P0001';
  end if;

  if v_credits + p_amount < 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.user_balance
  set credits = v_credits + p_amount, updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_transactions (
    user_id, amount, reason, idempotency_key, balance_after, metadata
  ) values (
    p_user_id, p_amount, p_reason, p_idempotency_key,
    v_credits + p_amount, coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.apply_credit_transaction(
  uuid, bigint, public.credit_reason, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_credit_transaction(
  uuid, bigint, public.credit_reason, text, jsonb
) to service_role;

-- Connecting Google creates the account row and a wallet with the $5.00
-- welcome credit. Name and email come from Google; cloud sync stays off
-- until the user enables it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), '')
  )
  on conflict (id) do nothing;

  insert into public.user_balance (user_id, credits)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  -- Idempotent per user, so re-creating the trigger never double-credits.
  perform public.apply_credit_transaction(
    new.id, 5000000, 'signup_bonus', 'signup_bonus:' || new.id::text,
    '{"note":"Welcome credit"}'::jsonb
  );

  return new;
end;
$$;

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_user_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_email();

-- One-time welcome credit for accounts created before the bonus existed.
-- Safe to re-run: the idempotency key makes repeats no-ops.
do $$
declare
  v_user uuid;
begin
  for v_user in
    select b.user_id from public.user_balance b
    where not exists (
      select 1 from public.credit_transactions t
      where t.idempotency_key = 'signup_bonus:' || b.user_id::text
    )
  loop
    perform public.apply_credit_transaction(
      v_user, 5000000, 'signup_bonus', 'signup_bonus:' || v_user::text,
      '{"note":"Welcome credit"}'::jsonb
    );
  end loop;
end;
$$;
