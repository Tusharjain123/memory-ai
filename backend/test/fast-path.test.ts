import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitAudioIntoChunks } from "../src/processing/audio-chunk.js";
import { chunkConcurrency } from "../src/processing/audio-probe.js";
import { DeepgramService } from "../src/processing/deepgram.service.js";
import { OllamaService, mapWithConcurrency } from "../src/processing/ollama.service.js";
import { transcriptPreview } from "../src/processing/processing-queue.service.js";

vi.mock("../src/processing/audio-chunk.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/processing/audio-chunk.js")>()),
  splitAudioIntoChunks: vi.fn(),
}));

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(splitAudioIntoChunks).mockReset();
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.DEEPGRAM_CHUNK_CONCURRENCY;
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_POLISH_CONCURRENCY;
});

describe("Deepgram fast path", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memory-ai-fast-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("defaults to parallel chunk requests", () => {
    expect(chunkConcurrency()).toBe(4);
    process.env.DEEPGRAM_CHUNK_CONCURRENCY = "20";
    expect(chunkConcurrency()).toBe(8);
  });

  it("transcribes chunks concurrently and retries only weak chunks in Hindi", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    const names = ["strong-0", "weak-1", "strong-2"];
    const chunks = await Promise.all(names.map(async (name, index) => {
      const path = join(directory, `${name}.m4a`);
      await writeFile(path, name);
      return { path, offsetSec: index * 300, durationSec: 300 };
    }));
    vi.mocked(splitAudioIntoChunks).mockResolvedValue(chunks);
    const source = join(directory, "source.m4a");
    await writeFile(source, "fake audio");

    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      const name = Buffer.from(init!.body as Uint8Array).toString("utf8");
      const language = new URL(String(url)).searchParams.get("language");
      const weak = name.startsWith("weak") && language === "multi";
      const word = (text: string, start: number) => ({
        word: text, punctuated_word: text, start, end: start + 0.5, speaker: 0,
      });
      const text = weak
        ? "hm"
        : `${name} ${language} ${"spoken words fill this chunk ".repeat(40)}`.trim();
      return json({
        metadata: { duration: 300 },
        results: {
          channels: [{
            alternatives: [{
              transcript: text,
              words: text.split(" ").map((item, index) => word(item, index * 0.5)),
            }],
          }],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new DeepgramService().transcribe(source, "audio/mp4", {
      durationSec: 900,
    });

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      language: new URL(String(url)).searchParams.get("language"),
      name: Buffer.from(init!.body as Uint8Array).toString("utf8"),
    }));
    expect(calls.filter((call) => call.language === "multi")).toHaveLength(3);
    expect(calls.filter((call) => call.language === "hi")).toEqual([
      { language: "hi", name: "weak-1" },
    ]);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(result.rawTranscript).toContain("weak-1 hi");
    expect(result.rawTranscript).toContain("strong-2 multi");
    expect(result.language).toBe("hi");
  });
});

describe("LLM fast path", () => {
  beforeEach(() => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
  });

  it("caps concurrent work", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(maxInFlight).toBe(2);
  });

  it("polishes segments in parallel batches and keeps raw text for a failed batch", async () => {
    const utterances = Array.from({ length: 85 }, (_, index) => ({
      speaker: 0,
      startMs: index * 1_000,
      endMs: index * 1_000 + 900,
      text: `line ${index + 1}`,
    }));
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      const user = body.messages.find((message) => message.role === "user")!.content;
      const ids = [...user.matchAll(/\[(segment-\d+) \|/g)].map((match) => match[1]!);
      if (ids.includes("segment-41")) {
        return json({ message: { content: "not json" } });
      }
      return json({
        message: {
          content: JSON.stringify({
            segments: ids.map((id) => ({
              id,
              cleanText: `clean ${id}`,
              romanHinglishText: `roman ${id}`,
            })),
          }),
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const polished = await new OllamaService().polishSegments(utterances, "hi");

    // 3 batches of ≤40; the failed middle batch is retried once then dropped.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(polished).toHaveLength(45);
    expect(polished.map((item) => item.id)).not.toContain("segment-41");
    expect(polished[0]).toEqual({
      id: "segment-1",
      cleanText: "clean segment-1",
      romanHinglishText: "roman segment-1",
    });
  });

  it("reports insights before the slower polish pass finishes", async () => {
    const service = new OllamaService();
    const order: string[] = [];
    vi.spyOn(service, "understand").mockResolvedValue({
      title: "Plan",
      mainGoal: "",
      summary: "Quick summary",
      topics: [],
      participants: [],
      decisions: [],
      commitments: [],
      memoryCandidates: [],
    });
    vi.spyOn(service, "polishSegments").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("polish-done");
      return [];
    });
    vi.spyOn(service, "embed").mockResolvedValue([]);

    const result = await service.assemble({
      rawTranscript: "hello",
      language: "en",
      durationMs: 1_000,
      utterances: [{ speaker: 0, startMs: 0, endMs: 1_000, text: "hello" }],
    }, {
      onStage: (event) => {
        order.push(event.stage === "insights" ? `insights:${event.summary}` : "polished");
      },
    });

    expect(order).toEqual(["insights:Quick summary", "polish-done", "polished"]);
    expect(result.segments[0]?.cleanText).toBe("hello");
  });
});

describe("transcriptPreview", () => {
  it("labels speakers and truncates long transcripts", () => {
    const preview = transcriptPreview([
      { speaker: 0, text: "Hi there" },
      { speaker: 1, text: "x".repeat(2_000) },
    ], "");
    expect(preview.startsWith("Speaker 1: Hi there\nSpeaker 2: ")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(1_501);
    expect(preview.endsWith("…")).toBe(true);
  });
});
