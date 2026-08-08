import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeepgramService,
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
  it("enables Nova-3 multilingual code-switching and current diarization", async () => {
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
      expect(url.searchParams.get("diarize_model")).toBe("latest");
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
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
