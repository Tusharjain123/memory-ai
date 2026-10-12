/** Wallet amounts arrive as integer micro-USD (1 USD = 1,000,000). */
export const MICROS_PER_USD = 1_000_000;
/** People see tokens: 1,000 tokens = $1 of AI cost. */
export const MICROS_PER_TOKEN = 1_000;

export function microsToTokens(micros: number): number {
  return Math.round(micros / MICROS_PER_TOKEN);
}

/** "12,480" — the number alone, for big displays. */
export function tokenCount(micros: number): string {
  return Math.abs(microsToTokens(micros)).toLocaleString("en-US");
}

/** "12,480 tokens", "+10,000 tokens", "−62 tokens". */
export function formatTokens(micros: number, options: { sign?: boolean } = {}): string {
  const tokens = microsToTokens(micros);
  const sign = tokens < 0 ? "−" : options.sign && tokens > 0 ? "+" : "";
  return `${sign}${Math.abs(tokens).toLocaleString("en-US")} token${Math.abs(tokens) === 1 ? "" : "s"}`;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export function minutesLabel(minutes: number): string {
  if (minutes >= 120) return `≈ ${Math.floor(minutes / 60)} h of conversations`;
  return `≈ ${minutes} min of conversations`;
}

