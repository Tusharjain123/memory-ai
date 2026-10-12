import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { GoogleConnectionStatus } from "../contracts";
import { supabaseConfig, supabaseHeaders } from "../supabase/supabase-rest.js";
import { GoogleApiException, googleNotConnected, googleReconnectRequired } from "./google-errors.js";
import { decryptToken, encryptToken, parseTokenKey } from "./token-crypto.js";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
export const GOOGLE_REQUIRED_SCOPES = [GOOGLE_CALENDAR_SCOPE, GOOGLE_MEET_SCOPE];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_TIMEOUT_MS = 20_000;
const ACCESS_TOKEN_SKEW_MS = 60_000;

type ConnectionRow = {
  user_id: string;
  google_email: string | null;
  scopes: string[];
  refresh_token_ciphertext: string;
  status: "active" | "revoked" | "expired";
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const key = parseTokenKey(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (!clientId || !clientSecret || !key) {
    throw new ServiceUnavailableException(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and a 32-byte base64 GOOGLE_TOKEN_ENCRYPTION_KEY are required for Google Calendar & Meet",
    );
  }
  return { clientId, clientSecret, key };
}

/** Email claim from Google's id_token. It came straight from Google over TLS, so no signature check. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

export function missingScopes(granted: string | undefined): string[] {
  const set = new Set((granted ?? "").split(/\s+/).filter(Boolean));
  return GOOGLE_REQUIRED_SCOPES.filter((scope) => !set.has(scope));
}

/**
 * Owns the Google refresh token for each account (encrypted in
 * google_connections) and hands out short-lived access tokens.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly accessTokens = new Map<string, { token: string; expiresAt: number }>();

  /** Exchanges the app's one-time server auth code and stores the refresh token. */
  async connect(userId: string, serverAuthCode: string): Promise<GoogleConnectionStatus> {
    const { clientId, clientSecret, key } = googleConfig();
    const tokens = await this.tokenRequest({
      code: serverAuthCode,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      // Native (Android/iOS) server auth codes have no redirect URI.
      redirect_uri: "",
    });
    if (!tokens.access_token) {
      throw new BadRequestException(tokens.error_description ?? "Google did not accept the sign-in code");
    }
    const missing = missingScopes(tokens.scope);
    if (missing.length) {
      throw new GoogleApiException(
        HttpStatus.BAD_REQUEST,
        "google_missing_scopes",
        "Allow access to Calendar and Meet to import meetings",
      );
    }
    let refreshCiphertext: string;
    if (tokens.refresh_token) {
      refreshCiphertext = encryptToken(tokens.refresh_token, key);
    } else {
      // Google only returns a refresh token on first consent; reuse the stored one.
      const existing = await this.load(userId);
      if (!existing) {
        throw new GoogleApiException(
          HttpStatus.BAD_REQUEST,
          "google_no_refresh_token",
          "Google didn't grant offline access. Remove Memory AI at myaccount.google.com/permissions, then connect again.",
        );
      }
      refreshCiphertext = existing.refresh_token_ciphertext;
    }
    const email = emailFromIdToken(tokens.id_token);
    await this.upsert({
      user_id: userId,
      google_email: email,
      scopes: (tokens.scope ?? "").split(/\s+/).filter(Boolean),
      refresh_token_ciphertext: refreshCiphertext,
      status: "active",
    });
    this.accessTokens.set(userId, {
      token: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3_600) * 1_000,
    });
    return { connected: true, email, status: "active" };
  }

  async status(userId: string): Promise<GoogleConnectionStatus> {
    const row = await this.load(userId);
    if (!row) return { connected: false, email: null, status: "disconnected" };
    return { connected: row.status === "active", email: row.google_email, status: row.status };
  }

  async disconnect(userId: string): Promise<void> {
    this.accessTokens.delete(userId);
    const row = await this.load(userId);
    if (!row) return;
    try {
      const { key } = googleConfig();
      const refreshToken = decryptToken(row.refresh_token_ciphertext, key);
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }).toString(),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });
    } catch (error) {
      // Revoking is best effort; the stored token is deleted either way.
      this.logger.warn(`Google token revoke failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
    await this.remove(userId);
  }

  async accessToken(userId: string): Promise<string> {
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expiresAt - ACCESS_TOKEN_SKEW_MS > Date.now()) return cached.token;
    const row = await this.load(userId);
    if (!row) throw googleNotConnected();
    if (row.status !== "active") throw googleReconnectRequired();
    const { clientId, clientSecret, key } = googleConfig();
    let refreshToken: string;
    try {
      refreshToken = decryptToken(row.refresh_token_ciphertext, key);
    } catch {
      await this.setStatus(userId, "expired");
      throw googleReconnectRequired();
    }
    const tokens = await this.tokenRequest({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });
    if (tokens.error === "invalid_grant") {
      await this.setStatus(userId, "expired");
      throw googleReconnectRequired();
    }
    if (!tokens.access_token) {
      throw new ServiceUnavailableException(
        `Google token refresh failed${tokens.error ? ` (${tokens.error})` : ""}`,
      );
    }
    this.accessTokens.set(userId, {
      token: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3_600) * 1_000,
    });
    return tokens.access_token;
  }

  /** GET a Google API as the user; retries once with a fresh token on 401. */
  async getJson<T>(userId: string, url: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.accessToken(userId);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });
      if (response.status === 401 && attempt === 0) {
        this.accessTokens.delete(userId);
        continue;
      }
      if (response.status === 404) {
        throw new GoogleApiException(HttpStatus.NOT_FOUND, "google_not_found", "Not found in Google");
      }
      if (response.status === 403) {
        const body = await response.text().catch(() => "");
        this.logger.warn(`Google API 403 for ${new URL(url).pathname}: ${body.slice(0, 300)}`);
        throw new GoogleApiException(
          HttpStatus.FORBIDDEN,
          "google_forbidden",
          /insufficient|scope/i.test(body)
            ? "Memory AI is missing Calendar or Meet permission. Reconnect Google Calendar & Meet."
            : "Google refused the request. Check that the Calendar and Meet APIs are enabled for this project.",
        );
      }
      if (!response.ok) {
        throw new ServiceUnavailableException(`Google API request failed (${response.status})`);
      }
      return (await response.json()) as T;
    }
    throw googleReconnectRequired();
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok && !body.error) {
      throw new ServiceUnavailableException(`Google token request failed (${response.status})`);
    }
    return body;
  }

  private async load(userId: string): Promise<ConnectionRow | null> {
    const { url, secret } = supabaseConfig("read Google connections");
    const response = await fetch(
      `${url}/rest/v1/google_connections?user_id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: supabaseHeaders(secret), signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(`Could not load Google connection (${response.status})`);
    }
    const rows = (await response.json()) as ConnectionRow[];
    return rows[0] ?? null;
  }

  private async upsert(row: ConnectionRow): Promise<void> {
    const { url, secret } = supabaseConfig("save Google connections");
    const response = await fetch(`${url}/rest/v1/google_connections?on_conflict=user_id`, {
      method: "POST",
      headers: supabaseHeaders(secret, {
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`Could not save Google connection (${response.status})`);
    }
  }

  private async setStatus(userId: string, status: ConnectionRow["status"]): Promise<void> {
    this.accessTokens.delete(userId);
    const { url, secret } = supabaseConfig("update Google connections");
    await fetch(`${url}/rest/v1/google_connections?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: supabaseHeaders(secret, { Prefer: "return=minimal" }),
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    }).catch(() => undefined);
  }

  private async remove(userId: string): Promise<void> {
    const { url, secret } = supabaseConfig("delete Google connections");
    const response = await fetch(
      `${url}/rest/v1/google_connections?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: supabaseHeaders(secret, { Prefer: "return=minimal" }),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(`Could not delete Google connection (${response.status})`);
    }
  }
}
