import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessedConversation } from "../src/contracts.js";
import { ProcessingResultStore } from "../src/processing/processing-result.store.js";

const conversation: ProcessedConversation = {
  schemaVersion: 2,
  title: "Standup",
  mainGoal: "Plan deploy",
  summary: "Rahul will deploy.",
  topics: ["deploy"],
  language: "hi",
  durationMs: 2_000,
  rawTranscript: "Aaj deploy karenge.",
  cleanTranscript: "We will deploy today.",
  romanHinglishTranscript: "Aaj deploy karenge.",
  participants: [],
  segments: [],
  decisions: [],
  commitments: [],
  memoryCandidates: [],
  actionItems: [],
  embeddings: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
});

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_SECRET_KEY = "service-secret";
});

describe("ProcessingResultStore", () => {
  it("requires Supabase configuration", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    await expect(
      new ProcessingResultStore().save("job-1", conversation, 4 * 60 * 60_000),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it("saves the conversation payload with a TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await new ProcessingResultStore().save("job-1", conversation, 4 * 60 * 60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://example.supabase.co/rest/v1/processing_results",
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(expect.objectContaining({
      Authorization: "Bearer service-secret",
      Prefer: "return=minimal",
    }));
    const body = JSON.parse(String(init.body)) as {
      job_id: string;
      payload: ProcessedConversation;
      expires_at: string;
    };
    expect(body.job_id).toBe("job-1");
    expect(body.payload).toEqual(conversation);
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now());
  });

  it("takes the payload by deleting the row", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify([{ payload: conversation }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new ProcessingResultStore().take("job-1")).resolves.toEqual(conversation);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://example.supabase.co/rest/v1/processing_results?job_id=eq.job-1",
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ Prefer: "return=representation" }),
    );
  });

  it("returns null when the handoff row is gone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
    await expect(new ProcessingResultStore().take("job-1")).resolves.toBeNull();
  });

  it("sweeps rows past expires_at", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await new ProcessingResultStore().sweepExpired();

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("https://example.supabase.co/rest/v1/processing_results?expires_at=lt.");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
  });
});
