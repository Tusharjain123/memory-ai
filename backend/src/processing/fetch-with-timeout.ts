import { Agent } from "undici";

const CONNECT_TIMEOUT_MS = 30_000;

export type FetchWithTimeoutInit = RequestInit & {
  dispatcher?: Agent;
};

export function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const requestInit: FetchWithTimeoutInit = {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    dispatcher: new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: Math.min(CONNECT_TIMEOUT_MS, timeoutMs),
    }),
  };
  return fetch(input, requestInit);
}

export function isDeadlineError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError") return true;
  const code = networkErrorCode(error);
  return code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT";
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error) || isDeadlineError(error)) return false;
  const code = networkErrorCode(error);
  if (error.message === "fetch failed") return true;
  if (code.startsWith("UND_ERR_")) return true;
  return (
    code === "ECONNRESET"
    || code === "ETIMEDOUT"
    || code === "ECONNREFUSED"
    || code === "EPIPE"
    || code === "ENOTFOUND"
    || code === "EAI_AGAIN"
  );
}

export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = networkErrorCode(error);
  const causeDetail = describeCause(error.cause);
  if (code && causeDetail && causeDetail !== error.message && causeDetail !== code) {
    return `${error.message} (${code}: ${causeDetail})`;
  }
  if (code) return `${error.message} (${code})`;
  if (causeDetail && causeDetail !== error.message) {
    return `${error.message} (${causeDetail})`;
  }
  return error.message;
}

export function describeErrorCause(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.cause == null) return undefined;
  const code = networkErrorCode(error);
  const detail = describeCause(error.cause);
  if (code && detail && detail !== code) return `${code}: ${detail}`;
  return code || detail;
}

function networkErrorCode(error: Error): string {
  return (readCode(error) ?? readCode(error.cause) ?? "").toUpperCase();
}

function readCode(value: unknown): string | undefined {
  if (value && typeof value === "object" && "code" in value && typeof value.code === "string") {
    return value.code;
  }
  return undefined;
}

function describeCause(value: unknown): string | undefined {
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return undefined;
}
