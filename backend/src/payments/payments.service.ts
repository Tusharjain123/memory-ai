import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AuthUser } from "../auth/supabase-jwt.js";
import { supabaseConfig, supabaseHeaders } from "../supabase/supabase-rest.js";
import { findPack, walletPacks, type WalletPack } from "../wallet/packs.js";
import { WalletService } from "../wallet/wallet.service.js";
import { createCheckoutSession, getPayment, getProductPrice, packPriceMismatch } from "./dodo.client.js";

const PRICE_CHECK_TTL_MS = 5 * 60_000;

const DB_TIMEOUT_MS = 15_000;

export type DodoWebhookEvent = {
  type?: string;
  data?: {
    payment_id?: string;
    checkout_session_id?: string;
    total_amount?: number;
    currency?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    product_cart?: Array<{ product_id?: string; quantity?: number }>;
  };
};

export type FulfilmentDecision =
  | { action: "credit"; userId: string; pack: WalletPack; paymentId: string }
  | { action: "ignore"; reason: string };

/**
 * Pure checks on a verified payment.succeeded event: the pack must exist and
 * its product must be the one paid for. Dodo may charge in the customer's
 * local currency (adaptive pricing, plus local tax), so the amount is only
 * compared when the charge was in USD; otherwise the matched product (fixed
 * USD price) on a signature-verified event is the proof of purchase.
 */
export function decideFulfilment(event: DodoWebhookEvent, lookup = findPack): FulfilmentDecision {
  const data = event.data ?? {};
  const paymentId = data.payment_id;
  const userId = typeof data.metadata?.user_id === "string" ? data.metadata.user_id : "";
  const packId = typeof data.metadata?.pack_id === "string" ? data.metadata.pack_id : "";
  if (!paymentId) return { action: "ignore", reason: "no payment_id" };
  if (!userId || !packId) return { action: "ignore", reason: "missing user_id/pack_id metadata" };
  const pack = lookup(packId);
  if (!pack) return { action: "ignore", reason: `unknown pack ${packId}` };
  const products = (data.product_cart ?? []).map((item) => item.product_id).filter(Boolean);
  if (products.length && !products.includes(pack.productId)) {
    return { action: "ignore", reason: "product does not match pack" };
  }
  const paidUsd = (data.currency ?? "USD").toUpperCase() === "USD";
  if (paidUsd && typeof data.total_amount === "number" && data.total_amount < pack.priceCents) {
    return { action: "ignore", reason: "amount paid is below the pack price" };
  }
  if (!paidUsd && !products.length) {
    // Without a USD amount, the product is the only proof of which pack was bought.
    return { action: "ignore", reason: `paid in ${data.currency} without a product to match` };
  }
  return { action: "credit", userId, pack, paymentId };
}

/** Dodo checkout for wallet packs and webhook fulfilment into the wallet. */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly verifiedPacks = new Map<string, number>();

  constructor(private readonly wallet: WalletService) {
    walletPacks(); // Fail fast at boot on a malformed WALLET_PACKS.
  }

  async startCheckout(user: AuthUser, packId: string): Promise<{ checkoutUrl: string; sessionId: string }> {
    const pack = findPack(packId);
    if (!pack) throw new NotFoundException("Unknown top-up pack");
    if (!user.email) throw new BadRequestException("Your account needs an email address to pay");

    await this.assertPackMatchesProduct(pack);
    const session = await createCheckoutSession({
      productId: pack.productId,
      email: user.email,
      // Straight back into the app: Chrome hands this link to the app with ?payment_id&status.
      returnUrl: process.env.APP_RETURN_URL?.trim() || "memoryai://wallet",
      metadata: { user_id: user.id, pack_id: pack.id },
    });
    await this.insertPayment({
      user_id: user.id,
      pack_id: pack.id,
      dodo_session_id: session.sessionId,
      amount_cents: pack.priceCents,
      currency: "USD",
      credit_micros: pack.creditMicros,
      status: "pending",
    }).catch((error: unknown) => {
      // The webhook still credits the wallet; this row is bookkeeping only.
      this.logger.warn(`Could not record pending payment: ${error instanceof Error ? error.message : error}`);
    });
    return session;
  }

  /**
   * Never send someone to pay for a pack the webhook would then refuse to
   * credit: the Dodo product's live price must match WALLET_PACKS.
   */
  private async assertPackMatchesProduct(pack: WalletPack): Promise<void> {
    const checkedAt = this.verifiedPacks.get(pack.id);
    if (checkedAt && Date.now() - checkedAt < PRICE_CHECK_TTL_MS) return;
    const mismatch = packPriceMismatch(pack, await getProductPrice(pack.productId));
    if (mismatch) {
      this.logger.error(`Top-up pack "${pack.id}" is misconfigured: ${mismatch}`);
      throw new ServiceUnavailableException("This top-up option is temporarily unavailable. Please choose another.");
    }
    this.verifiedPacks.set(pack.id, Date.now());
  }

  /**
   * Confirms a payment straight from Dodo's API and credits it if it
   * succeeded. Lets the app finish a top-up even if the webhook was missed
   * or delayed; crediting is idempotent with the webhook.
   */
  async verifyPayment(user: AuthUser, paymentId: string): Promise<{ status: string; credited: boolean }> {
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new BadRequestException("Invalid payment id");
    const payment = await getPayment(paymentId);
    if (!payment) throw new NotFoundException("Payment not found");
    const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
    if (metadata.user_id !== user.id) throw new ForbiddenException("This payment belongs to another account");
    const status = String(payment.status ?? "unknown");
    if (status !== "succeeded") return { status, credited: false };
    await this.handleEvent({ type: "payment.succeeded", data: { ...(payment as DodoWebhookEvent["data"]), payment_id: paymentId } });
    return { status, credited: true };
  }

  /** Handles a verified webhook event. Safe to receive more than once. */
  async handleEvent(event: DodoWebhookEvent): Promise<void> {
    const data = event.data ?? {};
    if (event.type === "payment.failed" || event.type === "payment.cancelled") {
      await this.markPayment(data, { status: event.type === "payment.failed" ? "failed" : "cancelled" });
      return;
    }
    if (event.type !== "payment.succeeded") return;

    const decision = decideFulfilment(event);
    if (decision.action === "ignore") {
      this.logger.warn(`Ignored payment ${data.payment_id ?? "?"}: ${decision.reason}`);
      return;
    }
    await this.wallet.applyTransaction({
      userId: decision.userId,
      amount: decision.pack.creditMicros,
      reason: "top_up",
      idempotencyKey: `top_up:${decision.paymentId}`,
      metadata: {
        paymentId: decision.paymentId,
        packId: decision.pack.id,
        paidCents: data.total_amount ?? decision.pack.priceCents,
      },
    });
    await this.markPayment(data, {
      status: "succeeded",
      dodo_payment_id: decision.paymentId,
      user_id: decision.userId,
      pack_id: decision.pack.id,
      amount_cents: data.total_amount ?? decision.pack.priceCents,
      currency: (data.currency ?? "USD").toUpperCase(),
      credit_micros: decision.pack.creditMicros,
    }).catch((error: unknown) => {
      this.logger.warn(`Credited but could not update payment row: ${error instanceof Error ? error.message : error}`);
    });
    this.logger.log(`Top-up ${decision.paymentId}: +${decision.pack.creditMicros} micros for ${decision.userId}`);
  }

  private async insertPayment(row: Record<string, unknown>): Promise<void> {
    const { url, secret } = supabaseConfig("record payments");
    const response = await fetch(`${url}/rest/v1/wallet_payments`, {
      method: "POST",
      headers: supabaseHeaders(secret, { Prefer: "return=minimal" }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`wallet_payments insert failed (${response.status})`);
  }

  /** Update the checkout's row when we know the session, else upsert by payment id. */
  private async markPayment(data: DodoWebhookEvent["data"] & object, patch: Record<string, unknown>): Promise<void> {
    const { url, secret } = supabaseConfig("record payments");
    const body = { ...patch, ...(data.payment_id ? { dodo_payment_id: data.payment_id } : {}), updated_at: new Date().toISOString() };
    if (data.checkout_session_id) {
      const response = await fetch(
        `${url}/rest/v1/wallet_payments?dodo_session_id=eq.${encodeURIComponent(data.checkout_session_id)}`,
        {
          method: "PATCH",
          headers: supabaseHeaders(secret, { Prefer: "return=representation" }),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(DB_TIMEOUT_MS),
        },
      );
      if (response.ok && ((await response.json()) as unknown[]).length) return;
    }
    if (!data.payment_id || !patch.user_id) return;
    const response = await fetch(`${url}/rest/v1/wallet_payments?on_conflict=dodo_payment_id`, {
      method: "POST",
      headers: supabaseHeaders(secret, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`wallet_payments upsert failed (${response.status})`);
  }
}
