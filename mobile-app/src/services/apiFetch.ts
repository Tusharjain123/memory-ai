import { API_URL } from "../config/api";
import { getSupabase } from "./supabase";

/** AI work needs an account (it spends wallet credit). */
export class SignInRequiredError extends Error {
  constructor() {
    super("Sign in with Google to turn recordings into memories. You'll get 5,000 free tokens.");
    this.name = "SignInRequiredError";
  }
}

/** The wallet can't cover this work; the recording stays on the device. */
export class InsufficientBalanceError extends Error {
  constructor(message: string, readonly balanceMicros: number, readonly requiredMicros: number) {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

export async function accessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Authorization header for signed-in backend calls; throws when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  if (!token) throw new SignInRequiredError();
  return { Authorization: `Bearer ${token}` };
}

/**
 * Turns a failed backend response into a readable error: the server's
 * message (not raw JSON), with typed errors for sign-in and low balance.
 */
export async function readApiError(response: Response, fallback: string): Promise<Error> {
  const text = await response.text().catch(() => "");
  let body: { message?: unknown; code?: string; balanceMicros?: number; requiredMicros?: number } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    // plain-text error
  }
  const trimmed = text.trim();
  const message = typeof body.message === "string" && body.message.trim()
    ? body.message
    : trimmed && !trimmed.startsWith("{") ? trimmed : `${fallback} (${response.status})`;
  if (response.status === 401) return new SignInRequiredError();
  if (response.status === 402 || body.code === "insufficient_balance") {
    return new InsufficientBalanceError(message, Number(body.balanceMicros ?? 0), Number(body.requiredMicros ?? 0));
  }
  return new Error(message);
}

/** Backend call for signed-in routes. */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(await authHeaders())) headers.set(key, value);
  if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export async function getCreditBalance(): Promise<number> {
  const response = await authorizedFetch("/v1/me/balance");
  if (!response.ok) throw await readApiError(response, "Could not load credits");
  const payload = (await response.json()) as { credits: number };
  return payload.credits;
}
