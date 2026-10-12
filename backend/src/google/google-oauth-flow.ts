import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { GOOGLE_REQUIRED_SCOPES } from "./google-oauth.service.js";

/** How long a "Connect Calendar" link stays valid. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

/** Where Google sends the consent result (must be an Authorized redirect URI on the Web client). */
export function oauthRedirectUri(): string | null {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const publicUrl = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  return publicUrl ? `${publicUrl}/v1/google/oauth/callback` : null;
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Opaque, signed, expiring state binding the Google consent to one signed-in user. */
export function signOAuthState(userId: string, key: Buffer, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + OAUTH_STATE_TTL_MS, n: randomBytes(9).toString("base64url") }))
    .toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function verifyOAuthState(state: string, key: Buffer, now = Date.now()): string | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; e?: unknown };
    if (typeof data.u !== "string" || typeof data.e !== "number" || data.e < now) return null;
    return data.u;
  } catch {
    return null;
  }
}

/**
 * Google's consent page for Calendar + Meet. access_type=offline with
 * prompt=consent makes Google always return a refresh token.
 */
export function googleConsentUrl(input: { clientId: string; redirectUri: string; state: string; loginHint?: string | null }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: ["openid", "email", ...GOOGLE_REQUIRED_SCOPES].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
    ...(input.loginHint ? { login_hint: input.loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Deep link back into the app after the consent page. */
export function appReturnUrl(result: { connected: true } | { error: string }): string {
  const base = process.env.APP_CALENDAR_RETURN_URL?.trim() || "memoryai://calendar";
  const query = "connected" in result ? "google=connected" : `google=error&reason=${encodeURIComponent(result.error)}`;
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}
