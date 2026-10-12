import { createHmac, timingSafeEqual } from "node:crypto";

/** Standard Webhooks (used by Dodo Payments) allow 5 minutes of clock skew. */
export const WEBHOOK_TOLERANCE_SEC = 5 * 60;

export type WebhookHeaders = {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
};

/** "whsec_<base64>" → raw key bytes; a secret without the prefix is used as-is. */
export function webhookKey(secret: string): Buffer {
  const trimmed = secret.trim();
  return trimmed.startsWith("whsec_")
    ? Buffer.from(trimmed.slice("whsec_".length), "base64")
    : Buffer.from(trimmed, "utf8");
}

export function signWebhook(secret: string, id: string, timestamp: string, body: string | Buffer): string {
  return createHmac("sha256", webhookKey(secret))
    .update(`${id}.${timestamp}.`)
    .update(body)
    .digest("base64");
}

/**
 * Verifies `webhook-signature` ("v1,<base64> v1,<base64> …") over
 * "{webhook-id}.{webhook-timestamp}.{raw body}" with HMAC-SHA256.
 */
export function verifyWebhook(
  secret: string,
  headers: WebhookHeaders,
  rawBody: string | Buffer,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing webhook headers" };
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSec - sentAt) > WEBHOOK_TOLERANCE_SEC) {
    return { ok: false, reason: "webhook timestamp outside tolerance" };
  }
  const expected = Buffer.from(signWebhook(secret, id, timestamp, rawBody), "base64");
  const matches = signature
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .some((entry) => {
      const candidate = Buffer.from(entry.slice(3), "base64");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
  return matches ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
