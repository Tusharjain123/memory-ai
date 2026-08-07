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
  decisions: [{ id: "decision-1", text: "Deploy today" }],
  actionItems: [{
    id: "action-1",
    task: "Complete deployment",
    owner: "Rahul",
    dueAt: null,
    completed: false as const,
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
    expect(body.format.required).toContain("romanHinglishTranscript");
    expect(body.format.properties).toHaveProperty("actionItems");
    const system = body.messages.find((message) => message.role === "system")?.content ?? "";
    const user = body.messages.find((message) => message.role === "user")?.content ?? "";
    expect(system).toContain("fix only obvious ASR typos");
    expect(system).toContain("Do not paraphrase, summarize, reorder, or add words");
    expect(system).toContain("romanize Hindi words faithfully");
    expect(system).toContain("Produce one segments entry per input utterance");
    expect(user).toContain("Detected languages: hi");
    expect(user).toContain("Keep cleaned and Hinglish text faithful");
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

  it("normalizes generated identities and derives transcripts from authoritative segments", async () => {
    const service = new OllamaService();
    vi.spyOn(service, "understand").mockResolvedValue({
      ...understanding,
      topics: [" deployment ", "deployment"],
      participants: [
        { name: " Rahul ", speakerLabel: "Speaker 1" },
        { name: "rahul", speakerLabel: "Speaker 1" },
      ],
      decisions: [
        { id: "duplicate", text: " Deploy today " },
        { id: "duplicate", text: "Notify the team" },
      ],
      actionItems: [
        {
          id: "duplicate",
          task: "Complete deployment",
          owner: "Rahul",
          dueAt: null,
          completed: false,
        },
        {
          id: "duplicate",
          task: " Notify team ",
          owner: "Rahul",
          dueAt: null,
          completed: false,
        },
      ],
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

    expect(result.topics).toEqual(["deployment"]);
    expect(result.participants).toHaveLength(1);
    expect(result.decisions.map((item) => item.id)).toEqual([
      "decision-1",
      "decision-2",
    ]);
    expect(result.actionItems.map((item) => item.id)).toEqual([
      "action-1",
      "action-2",
    ]);
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
  });
});
