import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepgramService } from "../src/processing/deepgram.service.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEEPGRAM_API_KEY;
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
      expect(url.searchParams.get("diarize_model")).toBe("latest");
      expect(url.searchParams.has("detect_language")).toBe(false);
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result.language).toBe("multi");
      expect(result.utterances[0]?.text).toBe("Aaj deploy karenge.");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
