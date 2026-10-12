import * as WebBrowser from "expo-web-browser";
import type { WalletTransaction } from "../utils/walletActivity";
import { checkoutReturn, type CheckoutOutcome } from "../utils/checkoutReturn";
import { authorizedFetch, readApiError } from "./apiFetch";

export { summarizeTransactions, type WalletActivity, type WalletTransaction } from "../utils/walletActivity";

export type WalletPack = { id: string; priceCents: number; creditMicros: number };

export type WalletSummary = {
  balanceMicros: number;
  updatedAt: string | null;
  minutesLeft: number;
  lowBalance: boolean;
  lowBalanceThresholdMicros: number;
  paymentsEnabled: boolean;
  packs: WalletPack[];
};

export async function getWallet(): Promise<WalletSummary> {
  const response = await authorizedFetch("/v1/me/wallet");
  if (!response.ok) throw await readApiError(response, "Could not load your wallet");
  return (await response.json()) as WalletSummary;
}

export async function getTransactions(limit = 50): Promise<WalletTransaction[]> {
  const response = await authorizedFetch(`/v1/me/transactions?limit=${limit}`);
  if (!response.ok) throw await readApiError(response, "Could not load wallet history");
  return (await response.json()) as WalletTransaction[];
}

/** Creates a Dodo checkout session for a pack; the app shows it in an in-app sheet. */
export async function createCheckout(packId: string): Promise<string> {
  const response = await authorizedFetch("/v1/wallet/checkout", {
    method: "POST",
    body: JSON.stringify({ packId }),
  });
  if (!response.ok) throw await readApiError(response, "Could not start checkout");
  const { checkoutUrl } = (await response.json()) as { checkoutUrl: string };
  return checkoutUrl;
}

/**
 * Asks the backend to confirm a payment with Dodo and credit it. Makes a
 * top-up land right away even when the webhook is slow or was missed.
 */
export async function verifyPayment(paymentId: string): Promise<{ status: string; credited: boolean }> {
  const response = await authorizedFetch(`/v1/wallet/payments/${encodeURIComponent(paymentId)}/verify`, { method: "POST" });
  if (!response.ok) throw await readApiError(response, "Could not confirm the payment");
  return (await response.json()) as { status: string; credited: boolean };
}

/**
 * Runs Dodo's checkout in a Custom Tab over the app (real Chrome, so bank OTP
 * / 3-D Secure and UPI work). Dodo returns to memoryai://wallet?payment_id&status,
 * which closes the tab and hands the result back here.
 */
export async function runCheckout(
  checkoutUrl: string,
  colors: { toolbar: string; controls: string },
): Promise<{ status: CheckoutOutcome; paymentId: string | null }> {
  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, "memoryai://wallet", {
    toolbarColor: colors.toolbar,
    controlsColor: colors.controls,
    secondaryToolbarColor: colors.toolbar,
    showTitle: true,
    enableBarCollapsing: false,
    showInRecents: false,
    createTask: false,
  });
  if (result.type === "success") return checkoutReturn(result.url) ?? { status: "processing", paymentId: null };
  return { status: "cancelled", paymentId: null };
}
