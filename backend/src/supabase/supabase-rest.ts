import { ServiceUnavailableException } from "@nestjs/common";

export type SupabaseConfig = { url: string; secret: string };

export function supabaseConfig(purpose: string): SupabaseConfig {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw new ServiceUnavailableException(
      `SUPABASE_URL and SUPABASE_SECRET_KEY are required to ${purpose}`,
    );
  }
  return { url, secret };
}

/** Service-role headers for PostgREST. Backend only; bypasses RLS. */
export function supabaseHeaders(
  secret: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
}
