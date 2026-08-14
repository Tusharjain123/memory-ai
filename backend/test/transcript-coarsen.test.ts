import { describe, expect, it } from "vitest";
import {
  assertWithinDurationLimit,
  maxAudioDurationSec,
} from "../src/processing/audio-limits.js";
import {
  coarsenUtterancesForUnderstanding,
  excerptUtterancesForUnderstanding,
  isLongTranscript,
  prepareUnderstandingUtterances,
  targetBlockMsForDuration,
} from "../src/processing/transcript-coarsen.js";

describe("audio limits", () => {
  it("defaults to a 3-hour maximum", () => {
    expect(maxAudioDurationSec()).toBe(10_800);
    expect(() => assertWithinDurationLimit(10_800)).not.toThrow();
    expect(() => assertWithinDurationLimit(10_801)).toThrow(/3 hour/);
  });
});

describe("transcript coarsening", () => {
  it("does not coarsen short transcripts", () => {
    const utterances = Array.from({ length: 50 }, (_, index) => ({
      speaker: index % 2,
      startMs: index * 1_000,
      endMs: index * 1_000 + 900,
      text: `Line ${index}`,
    }));
    expect(isLongTranscript({ rawTranscript: "x", language: "multi", durationMs: 50_000, utterances })).toBe(false);
    expect(coarsenUtterancesForUnderstanding(utterances)).toBe(utterances);
  });

  it("uses 60s blocks for recordings longer than 1 hour", () => {
    expect(targetBlockMsForDuration(3_600_001)).toBe(60_000);
    expect(targetBlockMsForDuration(3_000_000)).toBe(45_000);
  });

  it("excerpts when coarsened utterances remain too large", () => {
    const utterances = Array.from({ length: 300 }, (_, index) => ({
      speaker: index % 4,
      startMs: index * 10_000,
      endMs: index * 10_000 + 8_000,
      text: `Token ${index}`,
    }));
    const prepared = prepareUnderstandingUtterances({
      rawTranscript: "x".repeat(20_000),
      language: "multi",
      durationMs: 4_000_000,
      utterances,
    });
    expect(prepared.length).toBeLessThanOrEqual(151);
    expect(excerptUtterancesForUnderstanding(utterances).length).toBeLessThan(300);
  });
});
