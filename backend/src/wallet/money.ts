/**
 * Wallet amounts are integer micro-USD (1 USD = 1,000,000) so short
 * conversations that cost a fraction of a cent still debit precisely.
 */
export const MICROS_PER_USD = 1_000_000;

/**
 * People see "tokens": 1,000 tokens = $1 of AI cost, so 1 token = 1,000 micro-USD.
 * Every charge, hold and credit is a whole number of tokens.
 */
export const MICROS_PER_TOKEN = 1_000;
export const TOKENS_PER_USD = MICROS_PER_USD / MICROS_PER_TOKEN;

/** Credit granted to every new account: $5.00 = 5,000 tokens. */
export const SIGNUP_BONUS_MICROS = 5 * MICROS_PER_USD;

/** Round a cost up to whole tokens (never undercharge, never show fractions). */
export function roundUpToToken(micros: number): number {
  if (micros <= 0) return 0;
  return Math.ceil(micros / MICROS_PER_TOKEN) * MICROS_PER_TOKEN;
}

export function microsToTokens(micros: number): number {
  return Math.round(micros / MICROS_PER_TOKEN);
}

export function formatTokens(micros: number): string {
  const tokens = microsToTokens(micros);
  return `${tokens.toLocaleString("en-US")} token${Math.abs(tokens) === 1 ? "" : "s"}`;
}

export function usdToMicros(usd: number): number {
  return Math.round(usd * MICROS_PER_USD);
}

export function centsToMicros(cents: number): number {
  return Math.round(cents * 10_000);
}

export function formatMicros(micros: number): string {
  const usd = micros / MICROS_PER_USD;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  // Show sub-cent amounts with more precision so a $0.004 charge isn't "$0.00".
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  return `${sign}$${abs.toFixed(digits)}`;
}
