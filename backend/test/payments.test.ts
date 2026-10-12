import { describe, expect, it } from "vitest";
import { checkoutBody } from "../src/payments/dodo.client.js";
import { decideFulfilment } from "../src/payments/payments.service.js";
import { signWebhook, verifyWebhook } from "../src/payments/webhook-verify.js";
import { creditForPriceCents, parseWalletPacks, type WalletPack } from "../src/wallet/packs.js";

const secret = `whsec_${Buffer.from("super-secret-signing-key").toString("base64")}`;
const body = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_1" } });
const now = 1_800_000_000;

function headers(signature: string, timestamp = String(now)) {
  return { id: "msg_1", timestamp, signature };
}

describe("webhook verification", () => {
  const valid = `v1,${signWebhook(secret, "msg_1", String(now), body)}`;

  it("accepts a correct signature, also among several entries", () => {
    expect(verifyWebhook(secret, headers(valid), body, now)).toEqual({ ok: true });
    expect(verifyWebhook(secret, headers(`v1,AAAA ${valid}`), Buffer.from(body), now)).toEqual({ ok: true });
  });

  it("rejects tampering, wrong secrets, stale timestamps and missing headers", () => {
    expect(verifyWebhook(secret, headers(valid), body.replace("pay_1", "pay_2"), now).ok).toBe(false);
    expect(verifyWebhook(`whsec_${Buffer.from("other").toString("base64")}`, headers(valid), body, now).ok).toBe(false);
    expect(verifyWebhook(secret, headers(valid), body, now + 301).ok).toBe(false);
    expect(verifyWebhook(secret, { id: undefined, timestamp: String(now), signature: valid }, body, now).ok).toBe(false);
  });
});

describe("wallet packs", () => {
  it("gives two thirds of the price as whole tokens", () => {
    expect(creditForPriceCents(1500)).toBe(10_000_000); // 10,000 tokens
    expect(creditForPriceCents(600)).toBe(4_000_000); // 4,000 tokens
    expect(creditForPriceCents(1000) % 1_000).toBe(0); // $10 → 6,667 tokens, no fractions
    expect(creditForPriceCents(1000)).toBe(6_667_000);
  });

  it("parses and validates WALLET_PACKS", () => {
    const packs = parseWalletPacks('[{"id":"m","productId":"pdt_1","priceCents":1500,"creditMicros":999999999}]');
    expect(packs).toEqual([{ id: "m", productId: "pdt_1", priceCents: 1500, creditMicros: 10_000_000 }]);
    expect(parseWalletPacks(undefined)).toEqual([]);
    expect(() => parseWalletPacks('[{"id":"m","productId":"p","priceCents":50}]')).toThrow(/at least 100/);
    expect(() => parseWalletPacks('[{"id":"m","productId":"p","priceCents":600},{"id":"m","productId":"q","priceCents":900}]')).toThrow(/duplicate/);
    expect(() => parseWalletPacks("nope")).toThrow(/valid JSON/);
  });
});

describe("payment fulfilment", () => {
  const pack: WalletPack = { id: "m", productId: "pdt_1", priceCents: 1500, creditMicros: 10_000_000 };
  const lookup = (id: string) => (id === "m" ? pack : undefined);
  const event = (data: Record<string, unknown>) => ({
    type: "payment.succeeded",
    data: { payment_id: "pay_1", total_amount: 1500, currency: "USD", product_cart: [{ product_id: "pdt_1" }], metadata: { user_id: "u1", pack_id: "m" }, ...data },
  });

  it("credits a matching payment", () => {
    expect(decideFulfilment(event({}), lookup)).toEqual({ action: "credit", userId: "u1", pack, paymentId: "pay_1" });
  });

  it("ignores underpaid, mismatched or unattributed payments", () => {
    expect(decideFulfilment(event({ total_amount: 900 }), lookup).action).toBe("ignore");
    expect(decideFulfilment(event({ product_cart: [{ product_id: "pdt_other" }] }), lookup).action).toBe("ignore");
    expect(decideFulfilment(event({ currency: "INR", product_cart: [] }), lookup).action).toBe("ignore");
    expect(decideFulfilment(event({ metadata: {} }), lookup).action).toBe("ignore");
    expect(decideFulfilment(event({ metadata: { user_id: "u1", pack_id: "zzz" } }), lookup).action).toBe("ignore");
  });

  it("credits adaptive-currency payments (e.g. INR with GST) for the right product", () => {
    expect(decideFulfilment(event({ currency: "INR", total_amount: 70_616 }), lookup))
      .toEqual({ action: "credit", userId: "u1", pack, paymentId: "pay_1" });
  });

  it("builds the hosted checkout body", () => {
    expect(checkoutBody({ productId: "pdt_1", email: "a@b.co", returnUrl: "https://x/return", metadata: { user_id: "u1", pack_id: "m" } })).toEqual({
      product_cart: [{ product_id: "pdt_1", quantity: 1 }],
      customer: { email: "a@b.co" },
      return_url: "https://x/return",
      metadata: { user_id: "u1", pack_id: "m" },
    });
  });
});

describe("pack price check", () => {
  it("accepts a matching one-time USD price and explains mismatches", async () => {
    const { packPriceMismatch } = await import("../src/payments/dodo.client.js");
    const pack = { priceCents: 3000 };
    expect(packPriceMismatch(pack, { amountCents: 3000, currency: "USD", type: "one_time_price" })).toBeNull();
    expect(packPriceMismatch(pack, { amountCents: 2000, currency: "USD", type: "one_time_price" })).toMatch(/2000 cents/);
    expect(packPriceMismatch(pack, { amountCents: 3000, currency: "INR", type: "one_time_price" })).toMatch(/currency/);
    expect(packPriceMismatch(pack, { amountCents: 3000, currency: "USD", type: "recurring_price" })).toMatch(/one-time/);
  });
});
