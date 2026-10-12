import { MICROS_PER_TOKEN } from "./money.js";

export type WalletPack = {
  id: string;
  /** Dodo Payments one-time product for this pack. */
  productId: string;
  /** What the customer pays, in US cents. */
  priceCents: number;
  /** Wallet credit granted, in micro-USD. */
  creditMicros: number;
};

/** Paying $X buys ⅔·$X of AI credit (the 50% margin is taken at top-up). */
export const CREDIT_RATIO = 2 / 3;

/** Credit in micro-USD, rounded to whole tokens ($6 → 4,000 tokens). */
export function creditForPriceCents(priceCents: number): number {
  const tokens = Math.round(priceCents * 10 * CREDIT_RATIO); // 1 cent = 10 tokens
  return tokens * MICROS_PER_TOKEN;
}

/**
 * Packs from WALLET_PACKS, e.g.
 * [{"id":"small","productId":"pdt_x","priceCents":600}, ...].
 * Credit is always derived from the price, so the margin can't drift.
 */
export function parseWalletPacks(raw: string | undefined): WalletPack[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("WALLET_PACKS must be valid JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("WALLET_PACKS must be a JSON array");
  const seen = new Set<string>();
  return parsed.map((item, index) => {
    const entry = item as Partial<WalletPack>;
    const id = String(entry.id ?? "").trim();
    const productId = String(entry.productId ?? "").trim();
    const priceCents = Number(entry.priceCents);
    if (!id || !productId) throw new Error(`WALLET_PACKS[${index}] needs id and productId`);
    if (!Number.isInteger(priceCents) || priceCents < 100) {
      throw new Error(`WALLET_PACKS[${index}].priceCents must be an integer of at least 100`);
    }
    if (seen.has(id)) throw new Error(`WALLET_PACKS has duplicate id "${id}"`);
    seen.add(id);
    return { id, productId, priceCents, creditMicros: creditForPriceCents(priceCents) };
  });
}

let cached: { raw: string | undefined; packs: WalletPack[] } | null = null;

export function walletPacks(): WalletPack[] {
  const raw = process.env.WALLET_PACKS;
  if (!cached || cached.raw !== raw) cached = { raw, packs: parseWalletPacks(raw) };
  return cached.packs;
}

export function findPack(id: string): WalletPack | undefined {
  return walletPacks().find((pack) => pack.id === id);
}
