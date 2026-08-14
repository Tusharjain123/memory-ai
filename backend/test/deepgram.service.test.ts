import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeepgramService,
  buildListenUrl,
  mapDeepgramPayload,
  pickBetterTranscript,
  resolveDeepgramConfig,
  resolveDetectedLanguage,
} from "../src/processing/deepgram.service.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.DEEPGRAM_MODEL;
  delete process.env.DEEPGRAM_LANGUAGE;
});

describe("DeepgramService", () => {
  it("enables Nova-3 multilingual code-switching and diarization v2", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    const directory = await mkdtemp(join(tmpdir(), "memory-ai-test-"));
    const audioPath = join(directory, "sample.m4a");
    await writeFile(audioPath, "fake audio");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metadata: { duration: 2.5 },
      results: {
        channels: [{ alternatives: [{ transcript: "Aaj deploy karenge." }] }],
        utterances: [{
          speaker: 0,
          start: 0,
          end: 2.5,
          transcript: "Aaj deploy karenge.",
        }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await new DeepgramService().transcribe(audioPath, "audio/mp4");
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.get("model")).toBe("nova-3");
      expect(url.searchParams.get("language")).toBe("multi");
      expect(url.searchParams.get("punctuate")).toBe("true");
      expect(url.searchParams.has("diarize")).toBe(false);
      expect(url.searchParams.get("diarize_model")).toBe("v2");
      expect(url.searchParams.get("smart_format")).toBe("true");
      expect(url.searchParams.get("utterances")).toBe("true");
      expect(url.searchParams.has("detect_language")).toBe(false);
      expect(url.searchParams.has("keyterm")).toBe(false);
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result.language).toBe("multi");
      expect(result.utterances[0]?.text).toBe("Aaj deploy karenge.");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("appends keyterms to the listen URL", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    const directory = await mkdtemp(join(tmpdir(), "memory-ai-test-"));
    const audioPath = join(directory, "sample.m4a");
    await writeFile(audioPath, "fake audio");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metadata: { duration: 1 },
      results: {
        channels: [{ alternatives: [{ transcript: "Rahul will deploy." }] }],
        utterances: [],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await new DeepgramService().transcribe(audioPath, "audio/mp4", {
        keyterms: ["Rahul", "Memory AI"],
      });
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.getAll("keyterm")).toEqual(["Rahul", "Memory AI"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rebuilds utterances from word-level speaker labels", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    const directory = await mkdtemp(join(tmpdir(), "memory-ai-test-"));
    const audioPath = join(directory, "sample.m4a");
    await writeFile(audioPath, "fake audio");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metadata: { duration: 4 },
      results: {
        channels: [{
          alternatives: [{
            transcript: "Hello there. Hi. How are you?",
            words: [
              { word: "Hello", start: 0, end: 0.4, speaker: 0 },
              { word: "there", start: 0.4, end: 0.8, speaker: 0 },
              { word: "Hi", start: 0.9, end: 1.2, speaker: 1 },
              { word: "How", start: 1.5, end: 1.8, speaker: 2 },
              { word: "are", start: 1.8, end: 2.0, speaker: 2 },
              { word: "you", start: 2.0, end: 2.3, speaker: 2 },
            ],
          }],
        }],
        utterances: [{
          speaker: 0,
          start: 0,
          end: 2.3,
          transcript: "Hello there. Hi. How are you?",
        }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await new DeepgramService().transcribe(audioPath, "audio/mp4");
      expect(result.utterances.map((item) => item.speaker)).toEqual([0, 1, 2]);
      expect(result.utterances.map((item) => item.text)).toEqual([
        "Hello there",
        "Hi",
        "How are you",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retries with language=hi when multi transcript is weak", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    const directory = await mkdtemp(join(tmpdir(), "memory-ai-test-"));
    const audioPath = join(directory, "sample.m4a");
    await writeFile(audioPath, "fake audio");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        metadata: { duration: 60 },
        results: {
          channels: [{ alternatives: [{ transcript: "hm" }] }],
          utterances: [],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        metadata: { duration: 60 },
        results: {
          channels: [{
            alternatives: [{
              transcript: "Aaj hum deploy karenge aur Rahul review karega.",
            }],
          }],
          utterances: [{
            speaker: 0,
            start: 0,
            end: 5,
            transcript: "Aaj hum deploy karenge aur Rahul review karega.",
          }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await new DeepgramService().transcribe(audioPath, "audio/mp4");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const languages = fetchMock.mock.calls.map((call) =>
        new URL(String(call[0])).searchParams.get("language"),
      );
      expect(languages).toEqual(["multi", "hi"]);
      expect(result.rawTranscript).toContain("deploy");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("includes Deepgram error body when transcription fails", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    const directory = await mkdtemp(join(tmpdir(), "memory-ai-test-"));
    const audioPath = join(directory, "sample.m4a");
    await writeFile(audioPath, "fake audio");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Cannot set both diarize and diarize_model", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      }),
    ));

    try {
      await expect(
        new DeepgramService().transcribe(audioPath, "audio/mp4"),
      ).rejects.toThrow(
        "Transcription failed (400): Cannot set both diarize and diarize_model",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("applies env model and language and maps detected languages", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    process.env.DEEPGRAM_MODEL = "nova-3";
    process.env.DEEPGRAM_LANGUAGE = "hi";
    const directory = await mkdtemp(join(tmpdir(), "memory-ai-test-"));
    const audioPath = join(directory, "sample.m4a");
    await writeFile(audioPath, "fake audio");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metadata: { duration: 1 },
      results: {
        channels: [{
          alternatives: [{
            transcript: "Rahul will deploy Memory AI.",
            languages: ["hi", "en"],
          }],
        }],
        utterances: [],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await new DeepgramService().transcribe(audioPath, "audio/mp4");
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.get("model")).toBe("nova-3");
      expect(url.searchParams.get("language")).toBe("hi");
      expect(url.searchParams.has("keyterm")).toBe(false);
      expect(result.language).toBe("hi+en");
      // language=hi primary is not weak-retried again
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("buildListenUrl", () => {
  it("pins diarize_model=v2 and appends keyterms", () => {
    const url = buildListenUrl({ model: "nova-3", language: "multi" }, [
      "Priya",
      "  ",
      "Amit",
    ]);
    expect(url.searchParams.get("diarize_model")).toBe("v2");
    expect(url.searchParams.has("diarize")).toBe(false);
    expect(url.searchParams.getAll("keyterm")).toEqual(["Priya", "Amit"]);
  });
});

describe("mapDeepgramPayload", () => {
  it("prefers word-level rebuild over utterances", () => {
    const mapped = mapDeepgramPayload({
      metadata: { duration: 3 },
      results: {
        channels: [{
          alternatives: [{
            transcript: "One Two Three",
            words: [
              { word: "One", start: 0, end: 0.5, speaker: 0 },
              { word: "Two", start: 0.6, end: 1.0, speaker: 1 },
              { word: "Three", start: 1.1, end: 1.6, speaker: 2 },
            ],
          }],
        }],
        utterances: [{
          speaker: 0,
          start: 0,
          end: 1.6,
          transcript: "One Two Three",
        }],
      },
    }, "multi");
    expect(mapped.utterances).toHaveLength(3);
    expect(mapped.utterances.map((u) => u.speaker)).toEqual([0, 1, 2]);
  });
});

describe("pickBetterTranscript", () => {
  it("keeps the denser transcript", () => {
    const weak = {
      rawTranscript: "hm",
      language: "multi",
      durationMs: 60_000,
      utterances: [],
    };
    const strong = {
      rawTranscript: "Aaj meeting hai",
      language: "hi",
      durationMs: 60_000,
      utterances: [{ speaker: 0, startMs: 0, endMs: 1000, text: "Aaj meeting hai" }],
    };
    expect(pickBetterTranscript(weak, strong)).toBe(strong);
    expect(pickBetterTranscript(strong, weak)).toBe(strong);
  });
});

describe("resolveDeepgramConfig", () => {
  it("defaults to nova-3 multi", () => {
    expect(resolveDeepgramConfig()).toEqual({
      model: "nova-3",
      language: "multi",
    });
  });

  it("reads trimmed model and language from env", () => {
    process.env.DEEPGRAM_MODEL = " nova-3 ";
    process.env.DEEPGRAM_LANGUAGE = " en ";
    expect(resolveDeepgramConfig()).toEqual({
      model: "nova-3",
      language: "en",
    });
  });
});

describe("resolveDetectedLanguage", () => {
  it("joins alternative languages for LLM metadata", () => {
    expect(resolveDetectedLanguage(
      undefined,
      { languages: ["hi", "en", "hi"] },
      "multi",
    )).toBe("hi+en");
  });

  it("falls back to channel detected language then request language", () => {
    expect(resolveDetectedLanguage(
      { detected_language: "en" },
      { languages: [] },
      "multi",
    )).toBe("en");
    expect(resolveDetectedLanguage(undefined, undefined, "multi")).toBe("multi");
  });
});
