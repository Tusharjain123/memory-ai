import { ServiceUnavailableException } from "@nestjs/common";

const DODO_TIMEOUT_MS = 20_000;

export type DodoConfig = { baseUrl: string; apiKey: string };

/** DODO_ENV=live uses live.dodopayments.com; anything else is test mode. */
export function dodoConfig(): DodoConfig {
  const apiKey = process.env.DODO_API_KEY?.trim();
  if (!apiKey) throw new ServiceUnavailableException("Payments are not configured (DODO_API_KEY)");
  const live = process.env.DODO_ENV?.trim().toLowerCase() === "live";
  return { apiKey, baseUrl: live ? "https://live.dodopayments.com" : "https://test.dodopayments.com" };
}

export function paymentsConfigured(): boolean {
  return Boolean(process.env.DODO_API_KEY?.trim() && process.env.DODO_WEBHOOK_SECRET?.trim());
}

export type DodoProductPrice = { amountCents: number; currency: string; type: string };

/** A product's current one-time price, as configured in the Dodo dashboard. */
export async function getProductPrice(productId: string, config: DodoConfig = dodoConfig()): Promise<DodoProductPrice> {
  const response = await fetch(`${config.baseUrl}/products/${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(DODO_TIMEOUT_MS),
  });
  if (!response.ok) throw new ServiceUnavailableException(`Could not load top-up product (${response.status})`);
  const product = (await response.json()) as { price?: { price?: number; currency?: string; type?: string } };
  return {
    amountCents: Number(product.price?.price ?? NaN),
    currency: String(product.price?.currency ?? "").toUpperCase(),
    type: String(product.price?.type ?? ""),
  };
}

/** Why a pack and its Dodo product disagree, or null when they match. */
export function packPriceMismatch(pack: { priceCents: number }, price: DodoProductPrice): string | null {
  if (price.type && price.type !== "one_time_price") return `product is ${price.type}, expected a one-time price`;
  if (price.currency !== "USD") return `product currency is ${price.currency || "unknown"}, expected USD`;
  if (price.amountCents !== pack.priceCents) {
    return `product price is ${price.amountCents} cents but WALLET_PACKS says ${pack.priceCents}`;
  }
  return null;
}

/** A payment as Dodo reports it (same shape as the webhook's `data`). */
export async function getPayment(paymentId: string, config: DodoConfig = dodoConfig()): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${config.baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(DODO_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ServiceUnavailableException(`Could not check the payment (${response.status})`);
  return (await response.json()) as Record<string, unknown>;
}

export type CheckoutRequest = {
  productId: string;
  email: string;
  name?: string;
  returnUrl: string;
  metadata: Record<string, string>;
};

/** Body for POST /checkouts (hosted checkout session). */
export function checkoutBody(input: CheckoutRequest): Record<string, unknown> {
  return {
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
    return_url: input.returnUrl,
    metadata: input.metadata,
  };
}

export async function createCheckoutSession(
  input: CheckoutRequest,
  config: DodoConfig = dodoConfig(),
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const response = await fetch(`${config.baseUrl}/checkouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(checkoutBody(input)),
    signal: AbortSignal.timeout(DODO_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new ServiceUnavailableException(`Could not start checkout (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const payload = (await response.json()) as { session_id?: string; checkout_url?: string | null };
  if (!payload.session_id || !payload.checkout_url) {
    throw new ServiceUnavailableException("Checkout session returned no URL");
  }
  return { sessionId: payload.session_id, checkoutUrl: payload.checkout_url };
}
