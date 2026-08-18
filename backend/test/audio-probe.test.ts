import { describe, expect, it, afterEach } from "vitest";
import {
  computeDeepgramTimeoutMs,
  computeFfmpegTimeoutMs,
  computeOllamaChatTimeoutMs,
  computePollDeadlineMs,
  shouldChunkAudio,
} from "../src/processing/audio-probe.js";
import { MAX_AUDIO_DURATION_SEC } from "../src/processing/audio-limits.js";

afterEach(() => {
  delete process.env.DEEPGRAM_TIMEOUT_MS;
  delete process.env.FFMPEG_TIMEOUT_MS;
  delete process.env.OLLAMA_CHAT_TIMEOUT_MS;
  delete process.env.DEEPGRAM_CHUNK_THRESHOLD_SEC;
});

describe("timeout scaling", () => {
  it("scales ffmpeg timeout with duration and caps at 20 minutes", () => {
    expect(computeFfmpegTimeoutMs(60)).toBe(120_000);
    expect(computeFfmpegTimeoutMs(600)).toBe(330_000);
    expect(computeFfmpegTimeoutMs(10_000)).toBe(1_200_000);
  });

  it("scales Deepgram timeout with duration; floor defaults to 10 minutes", () => {
    expect(computeDeepgramTimeoutMs(120)).toBe(600_000);
    expect(computeDeepgramTimeoutMs(600)).toBe(600_000);
    expect(computeDeepgramTimeoutMs(3_600)).toBe(600_000);
  });

  it("treats env Deepgram timeout as a floor", () => {
    process.env.DEEPGRAM_TIMEOUT_MS = "720000";
    expect(computeDeepgramTimeoutMs(120)).toBe(720_000);
  });

  it("scales Ollama chat timeout with duration up to 20 minutes", () => {
    expect(computeOllamaChatTimeoutMs(60)).toBe(300_000);
    expect(computeOllamaChatTimeoutMs(10_800)).toBe(1_200_000);
  });

  it("scales mobile poll deadline to 150 minutes for 3-hour audio", () => {
    expect(computePollDeadlineMs()).toBe(30 * 60_000);
    expect(computePollDeadlineMs(600)).toBe(1_380_000);
    expect(computePollDeadlineMs(MAX_AUDIO_DURATION_SEC)).toBe(150 * 60_000);
  });
});

describe("shouldChunkAudio", () => {
  it("chunks when audio exceeds 5 minutes by default", () => {
    expect(shouldChunkAudio(299)).toBe(false);
    expect(shouldChunkAudio(301)).toBe(true);
  });
});
