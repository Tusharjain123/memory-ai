import { describe, expect, it } from "vitest";
import { checkoutReturn } from "./checkoutReturn";

describe("checkoutReturn", () => {
  it("recognises Dodo's return URL and reads the status", () => {
    expect(checkoutReturn("https://abc.ngrok-free.app/v1/payments/dodo/return?payment_id=pay_1&status=succeeded"))
      .toEqual({ status: "succeeded", paymentId: "pay_1" });
    expect(checkoutReturn("https://api.example.com/v1/payments/dodo/return?status=failed"))
      .toEqual({ status: "failed", paymentId: null });
    expect(checkoutReturn("memoryai://wallet?checkout=done")).toEqual({ status: "processing", paymentId: null });
  });

  it("ignores checkout pages", () => {
    expect(checkoutReturn("https://test.checkout.dodopayments.com/session/cks_123")).toBeNull();
    expect(checkoutReturn("https://abc.ngrok-free.app/v1/payments/dodo/returned")).toBeNull();
  });
});
