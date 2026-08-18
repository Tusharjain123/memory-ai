import { describe, expect, it } from "vitest";
import { mergeChunkPayloads } from "../src/processing/deepgram.service.js";
import { mapSegmentFilesToChunks, resolveChunkDurationSec } from "../src/processing/audio-chunk.js";

describe("resolveChunkDurationSec", () => {
  it("uses the client duration when ffmpeg probe returns 0", () => {
    expect(resolveChunkDurationSec({ durationSec: 0, channels: 1 }, 3_600)).toBe(3_600);
    expect(resolveChunkDurationSec({ durationSec: 120, channels: 1 }, 3_600)).toBe(120);
  });
});

describe("mapSegmentFilesToChunks", () => {
  it("maps one-pass segment files to timed chunks", () => {
    const chunks = mapSegmentFilesToChunks(
      ["seg-000.m4a", "seg-001.m4a", "ignore.bin", "seg-002.m4a"],
      "/tmp/audio",
      300,
      720,
    );
    expect(chunks).toEqual([
      { path: "/tmp/audio/seg-000.m4a", offsetSec: 0, durationSec: 300 },
      { path: "/tmp/audio/seg-001.m4a", offsetSec: 300, durationSec: 300 },
      { path: "/tmp/audio/seg-002.m4a", offsetSec: 600, durationSec: 120 },
    ]);
  });
});

describe("mergeChunkPayloads", () => {
  it("offsets word timings and rebuilds speaker turns across chunks", () => {
    const merged = mergeChunkPayloads([
      {
        offsetSec: 0,
        payload: {
          metadata: { duration: 900 },
          results: {
            channels: [{
              alternatives: [{
                words: [
                  { word: "Hello", start: 0, end: 0.4, speaker: 0 },
                  { word: "there", start: 0.4, end: 0.8, speaker: 0 },
                ],
              }],
            }],
          },
        },
      },
      {
        offsetSec: 900,
        payload: {
          metadata: { duration: 900 },
          results: {
            channels: [{
              alternatives: [{
                words: [
                  { word: "Namaste", start: 0.2, end: 0.7, speaker: 1 },
                  { word: "dost", start: 0.7, end: 1.0, speaker: 1 },
                ],
              }],
            }],
          },
        },
      },
    ], "multi", 1_800_000);

    expect(merged.durationMs).toBe(1_800_000);
    expect(merged.rawTranscript).toBe("Hello there Namaste dost");
    expect(merged.utterances).toEqual([
      { speaker: 0, startMs: 0, endMs: 800, text: "Hello there" },
      { speaker: 1, startMs: 900_200, endMs: 901_000, text: "Namaste dost" },
    ]);
  });
});
