import { afterEach, describe, expect, it, vi } from "vitest";
import { Agent } from "undici";
import {
  describeErrorCause,
  describeFetchError,
  fetchWithTimeout,
  isDeadlineError,
  isRetryableNetworkError,
} from "../src/processing/fetch-with-timeout.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("passes an undici Agent so headersTimeout matches the request deadline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("https://example.com/api", { method: "POST" }, 12_000);

    const init = fetchMock.mock.calls[0]?.[1] as { dispatcher?: Agent; signal?: AbortSignal };
    expect(init.dispatcher).toBeInstanceOf(Agent);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("network error classification", () => {
  it("retries undici fetch failed and connection resets", () => {
    expect(isRetryableNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableNetworkError(errorWithCode("UND_ERR_SOCKET"))).toBe(true);
    expect(isRetryableNetworkError(errorWithCode("ECONNRESET"))).toBe(true);
    expect(isRetryableNetworkError(errorWithCode("ETIMEDOUT"))).toBe(true);
  });

  it("does not retry deadline errors", () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    expect(isDeadlineError(timeout)).toBe(true);
    expect(isRetryableNetworkError(timeout)).toBe(false);
    expect(isDeadlineError(errorWithCode("UND_ERR_HEADERS_TIMEOUT", "fetch failed"))).toBe(true);
    expect(isRetryableNetworkError(errorWithCode("UND_ERR_HEADERS_TIMEOUT", "fetch failed"))).toBe(false);
    expect(isRetryableNetworkError(new Error("model exploded"))).toBe(false);
  });

  it("includes undici cause codes in the public error text", () => {
    const error = errorWithCode("UND_ERR_SOCKET", "fetch failed", "other side closed");
    expect(describeFetchError(error)).toBe("fetch failed (UND_ERR_SOCKET: other side closed)");
    expect(describeErrorCause(error)).toBe("UND_ERR_SOCKET: other side closed");
  });
});

function errorWithCode(code: string, message = "fetch failed", causeMessage = "socket"): TypeError {
  const cause = Object.assign(new Error(causeMessage), { code });
  return Object.assign(new TypeError(message), { cause });
}
