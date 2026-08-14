import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaService } from "../src/processing/ollama.service.js";

const understanding = {
  title: "Deployment planning",
  mainGoal: "Plan today's deployment",
  summary: "Rahul will complete deployment today.",
  topics: ["deployment"],
  cleanTranscript: "We will deploy today.",
  romanHinglishTranscript: "Aaj deploy karenge.",
  participants: [{ name: "Rahul", speakerLabel: "Speaker 1" }],
  segments: [{
    id: "segment-1",
    speakerLabel: "Speaker 1",
    startMs: 0,
    endMs: 2_000,
    rawText: "Aaj deploy karenge.",
    cleanText: "We will deploy today.",
    romanHinglishText: "Aaj deploy karenge.",
  }],
  decisions: [{
    id: "decision-1",
    text: "Deploy today",
    confidence: "high" as const,
    segmentId: "segment-1",
    quote: "Aaj deploy karenge.",
  }],
  commitments: [{
    id: "commitment-1",
    text: "Complete deployment",
    direction: "they_owe" as const,
    ownerName: "Rahul",
    counterpartyName: null,
    dueAt: null,
    status: "proposed" as const,
    confidence: "high" as const,
    segmentId: "segment-1",
    quote: "Aaj deploy karenge.",
  }],
  memoryCandidates: [{
    id: "memory-1",
    personName: "Rahul",
    kind: "fact" as const,
    text: "Rahul owns deployment",
    memoryClass: "transcript_fact" as const,
    confidence: "medium" as const,
    segmentId: "segment-1",
    quote: "Aaj deploy karenge.",
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OLLAMA_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_EMBED_DIMENSIONS;
});

beforeEach(() => {
  process.env.OLLAMA_URL = "http://127.0.0.1:11434";
});

describe("OllamaService", () => {
  it("batches conversation and segment text through OpenAI embeddings", async () => {
    process.env.OPENAI_API_KEY = "openai-secret";
    process.env.OPENAI_EMBED_DIMENSIONS = "2";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { index: 0, embedding: [0.1, 0.2] },
        { index: 1, embedding: [0.3, 0.4] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OllamaService().embed(understanding);

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.model === "text-embedding-3-large:2")).toBe(true);
    expect(result.map((item) => item.sourceType)).toEqual(["conversation", "segment"]);
    const body = JSON.parse(String(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body,
    )) as { input: string[] };
    expect(body.input[0]).toContain("Deployment planning");
    expect(body.input[1]).toBe("We will deploy today.");
  });

  it("sends a real JSON schema and validates structured understanding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: JSON.stringify(understanding) } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new OllamaService();

    const result = await service.understand({
      rawTranscript: "Aaj deploy karenge.",
      language: "hi",
      durationMs: 2_000,
      utterances: [{ speaker: 0, startMs: 0, endMs: 2_000, text: "Aaj deploy karenge." }],
    });

    expect(result).toEqual(understanding);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      format: { type: string; required: string[]; properties: Record<string, unknown> };
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.format.type).toBe("object");
    expect(body.format.required).toContain("commitments");
    expect(body.format.required).toContain("memoryCandidates");
    expect(body.format.properties).toHaveProperty("commitments");
    expect(body.format.properties).not.toHaveProperty("actionItems");
    const system = body.messages.find((message) => message.role === "system")?.content ?? "";
    const user = body.messages.find((message) => message.role === "user")?.content ?? "";
    expect(system).toContain("fix only obvious ASR typos");
    expect(system).toContain("explicit promises");
    expect(system).toContain("Do not invent evidence");
    expect(user).toContain("Detected languages: hi");
  });

  it("rejects malformed model output instead of persisting it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: JSON.stringify({ title: "Incomplete" }) } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    const service = new OllamaService();
    await expect(service.understand({
      rawTranscript: "test",
      language: "en",
      durationMs: 100,
      utterances: [],
    })).rejects.toThrow();
  });

  it("normalizes commitments with evidence from authoritative segments", async () => {
    const service = new OllamaService();
    vi.spyOn(service, "understand").mockResolvedValue({
      ...understanding,
      topics: [" deployment ", "deployment"],
      participants: [
        { name: " Rahul ", speakerLabel: "Speaker 1" },
        { name: "rahul", speakerLabel: "Speaker 1" },
      ],
      decisions: [
        {
          id: "duplicate",
          text: " Deploy today ",
          confidence: "high",
          segmentId: "segment-1",
          quote: "Aaj deploy karenge.",
        },
        {
          id: "duplicate",
          text: "Notify the team",
          confidence: "medium",
          segmentId: null,
          quote: null,
        },
      ],
      commitments: [
        {
          id: "duplicate",
          text: "Complete deployment",
          direction: "they_owe",
          ownerName: "Rahul",
          counterpartyName: null,
          dueAt: null,
          status: "proposed",
          confidence: "high",
          segmentId: "segment-1",
          quote: "Aaj deploy karenge.",
        },
        {
          id: "duplicate",
          text: " Notify team ",
          direction: "i_owe",
          ownerName: null,
          counterpartyName: "Rahul",
          dueAt: null,
          status: "proposed",
          confidence: "low",
          segmentId: null,
          quote: null,
        },
      ],
      memoryCandidates: [],
      cleanTranscript: "Untrusted top-level text",
      romanHinglishTranscript: "Untrusted top-level text",
    });
    vi.spyOn(service, "embed").mockResolvedValue([]);

    const result = await service.assemble({
      rawTranscript: "Aaj deploy karenge.",
      language: "hi",
      durationMs: 2_000,
      utterances: [{
        speaker: 0,
        startMs: 0,
        endMs: 2_000,
        text: "Aaj deploy karenge.",
      }],
    });

    expect(result.schemaVersion).toBe(2);
    expect(result.topics).toEqual(["deployment"]);
    expect(result.participants).toHaveLength(1);
    expect(result.decisions.map((item) => item.id)).toEqual([
      "decision-1",
      "decision-2",
    ]);
    expect(result.commitments.map((item) => item.id)).toEqual([
      "commitment-1",
      "commitment-2",
    ]);
    expect(result.commitments[0]).toMatchObject({
      startMs: 0,
      speakerLabel: "Speaker 1",
      segmentId: "segment-1",
      quote: "Aaj deploy karenge.",
    });
    expect(result.actionItems).toHaveLength(2);
    expect(result.cleanTranscript).toBe("We will deploy today.");
    expect(result.romanHinglishTranscript).toBe("Aaj deploy karenge.");
  });

  it("creates the memory when optional embedding generation fails", async () => {
    const service = new OllamaService();
    vi.spyOn(service, "understand").mockResolvedValue(understanding);
    vi.spyOn(service, "embed").mockRejectedValue(new Error("Embedding failed (401)"));

    const result = await service.assemble({
      rawTranscript: "Aaj deploy karenge.",
      language: "hi",
      durationMs: 2_000,
      utterances: [{
        speaker: 0,
        startMs: 0,
        endMs: 2_000,
        text: "Aaj deploy karenge.",
      }],
    });

    expect(result.title).toBe("Deployment planning");
    expect(result.embeddings).toEqual([]);
    expect(result.commitments).toHaveLength(1);
  });
});
