import { Logger } from "@nestjs/common";
import { SIGNUP_BONUS_MICROS } from "../wallet/money.js";
import { supabaseConfig, supabaseHeaders } from "./supabase-rest.js";

const TIMEOUT_MS = 15_000;
const logger = new Logger("AccountRows");

/**
 * Makes sure a signed-in user has their public.users row and wallet. These are
 * normally created by the auth trigger; if they were ever lost (e.g. a table
 * reset), recreate them instead of failing every write that references them.
 * The welcome credit uses its usual one-time key, so it is never granted twice.
 */
export async function ensureAccountRows(userId: string, email: string | null): Promise<void> {
  const { url, secret } = supabaseConfig("create account rows");
  const ignore = supabaseHeaders(secret, { Prefer: "resolution=ignore-duplicates,return=representation" });
  const users = await fetch(`${url}/rest/v1/users?on_conflict=id`, {
    method: "POST",
    headers: ignore,
    body: JSON.stringify({ id: userId, email }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!users.ok) throw new Error(`Could not create account row (${users.status})`);
  const created = ((await users.json()) as unknown[]).length > 0;
  const wallet = await fetch(`${url}/rest/v1/user_balance?on_conflict=user_id`, {
    method: "POST",
    headers: ignore,
    body: JSON.stringify({ user_id: userId, credits: 0 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!wallet.ok) throw new Error(`Could not create wallet (${wallet.status})`);
  const walletCreated = ((await wallet.json()) as unknown[]).length > 0;
  if (!created && !walletCreated) return;
  logger.warn(`Recreated missing account rows for ${userId}`);
  await fetch(`${url}/rest/v1/rpc/apply_credit_transaction`, {
    method: "POST",
    headers: supabaseHeaders(secret),
    body: JSON.stringify({
      p_user_id: userId,
      p_amount: SIGNUP_BONUS_MICROS,
      p_reason: "signup_bonus",
      p_idempotency_key: `signup_bonus:${userId}`,
      p_metadata: { note: "Welcome credit" },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined);
}
