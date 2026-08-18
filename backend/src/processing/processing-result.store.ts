import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { ProcessedConversation } from "../contracts";

const RESULT_FETCH_TIMEOUT_MS = 60_000;

@Injectable()
export class ProcessingResultStore {
  async save(
    jobId: string,
    result: ProcessedConversation,
    ttlMs: number,
  ): Promise<void> {
    const { url, secret } = supabaseConfig();
    const response = await fetch(`${url}/rest/v1/processing_results`, {
      method: "POST",
      headers: supabaseHeaders(secret, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        job_id: jobId,
        payload: result,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      }),
      signal: AbortSignal.timeout(RESULT_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Could not store processing result (${response.status})`,
      );
    }
  }

  async take(jobId: string): Promise<ProcessedConversation | null> {
    const { url, secret } = supabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/processing_results?job_id=eq.${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        headers: supabaseHeaders(secret, { Prefer: "return=representation" }),
        signal: AbortSignal.timeout(RESULT_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Could not load processing result (${response.status})`,
      );
    }
    const rows = (await response.json()) as Array<{ payload?: ProcessedConversation }>;
    const payload = rows[0]?.payload;
    if (!payload || payload.schemaVersion !== 2) return null;
    return payload;
  }

  async sweepExpired(): Promise<void> {
    const { url, secret } = supabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/processing_results?expires_at=lt.${encodeURIComponent(
        new Date().toISOString(),
      )}`,
      {
        method: "DELETE",
        headers: supabaseHeaders(secret, { Prefer: "return=minimal" }),
        signal: AbortSignal.timeout(RESULT_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Could not sweep processing results (${response.status})`,
      );
    }
  }
}

function supabaseConfig(): { url: string; secret: string } {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw new ServiceUnavailableException(
      "SUPABASE_URL and SUPABASE_SECRET_KEY are required to hand off processing results",
    );
  }
  return { url, secret };
}

function supabaseHeaders(
  secret: string,
  extra: Record<string, string>,
): Record<string, string> {
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
}
