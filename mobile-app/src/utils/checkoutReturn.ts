export type CheckoutOutcome = "succeeded" | "failed" | "cancelled" | "processing";

/**
 * Dodo sends the browser to our return URL with ?payment_id=…&status=…
 * (and our server bounces to memoryai://wallet). Either one means checkout is over.
 */
export function checkoutReturn(url: string): { status: CheckoutOutcome; paymentId: string | null } | null {
  const isReturn = url.startsWith("memoryai://") || /\/v1\/payments\/dodo\/return(\?|$|#)/.test(url);
  if (!isReturn) return null;
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#")[0]! : "";
  const params = new Map(query.split("&").filter(Boolean).map((pair) => {
    const [key, value = ""] = pair.split("=");
    return [decodeURIComponent(key!), decodeURIComponent(value.replace(/\+/g, " "))] as const;
  }));
  const raw = (params.get("status") ?? "").toLowerCase();
  const status: CheckoutOutcome = raw === "succeeded" || raw === "success" || raw === "paid"
    ? "succeeded"
    : raw === "failed" || raw === "declined"
      ? "failed"
      : raw === "cancelled" || raw === "canceled"
        ? "cancelled"
        : "processing";
  return { status, paymentId: params.get("payment_id") ?? null };
}
