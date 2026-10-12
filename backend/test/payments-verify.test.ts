import { ForbiddenException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPayment } from "../src/payments/dodo.client.js";
import { PaymentsService } from "../src/payments/payments.service.js";

vi.mock("../src/payments/dodo.client.js", async (original) => ({
  ...(await original<typeof import("../src/payments/dodo.client.js")>()),
  getPayment: vi.fn(),
}));
vi.mock("../src/wallet/packs.js", async (original) => ({
  ...(await original<typeof import("../src/wallet/packs.js")>()),
  walletPacks: () => [],
  findPack: (id: string) => (id === "plus" ? { id: "plus", productId: "pdt_plus", priceCents: 1500, creditMicros: 10_000_000 } : undefined),
}));


const payment = {
  status: "succeeded",
  total_amount: 176_540,
  currency: "INR",
  metadata: { user_id: "u1", pack_id: "plus" },
  product_cart: [{ product_id: "pdt_plus", quantity: 1 }],
};

function service() {
  const wallet = { applyTransaction: vi.fn(async () => ({})) };
  const payments = new PaymentsService(wallet as never);
  vi.spyOn(payments as never, "markPayment" as never).mockResolvedValue(undefined as never);
  return { wallet, payments };
}

afterEach(() => vi.clearAllMocks());

describe("verifyPayment", () => {
  it("credits a succeeded payment for its owner with the webhook's idempotency key", async () => {
    vi.mocked(getPayment).mockResolvedValue(payment);
    const { wallet, payments } = service();
    await expect(payments.verifyPayment({ id: "u1", email: null }, "pay_ABC123")).resolves.toEqual({ status: "succeeded", credited: true });
    expect(wallet.applyTransaction).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u1", amount: 10_000_000, reason: "top_up", idempotencyKey: "top_up:pay_ABC123",
    }));
  });

  it("refuses someone else's payment and doesn't credit unfinished ones", async () => {
    vi.mocked(getPayment).mockResolvedValue(payment);
    const { wallet, payments } = service();
    await expect(payments.verifyPayment({ id: "intruder", email: null }, "pay_ABC123")).rejects.toBeInstanceOf(ForbiddenException);
    vi.mocked(getPayment).mockResolvedValue({ ...payment, status: "processing" });
    await expect(payments.verifyPayment({ id: "u1", email: null }, "pay_ABC123")).resolves.toEqual({ status: "processing", credited: false });
    expect(wallet.applyTransaction).not.toHaveBeenCalled();
  });
});
