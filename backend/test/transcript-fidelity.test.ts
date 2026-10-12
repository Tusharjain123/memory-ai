import { describe, expect, it } from "vitest";
import { authoritativeSegments } from "../src/processing/transcript-fidelity.js";
import type { SegmentPolish } from "../src/processing/result.schema.js";

const polish: SegmentPolish[] = [{
  id: "segment-1",
  cleanText: "We will deploy today.",
  romanHinglishText: "Aaj deploy karenge.",
}];

describe("authoritativeSegments", () => {
  it("preserves Deepgram speaker, timing, and raw words", () => {
    const segments = authoritativeSegments({
      rawTranscript: "आज deploy करेंगे.",
      language: "multi",
      durationMs: 2_000,
      utterances: [{
        speaker: 1,
        startMs: 120,
        endMs: 1_900,
        text: "आज deploy करेंगे.",
      }],
    }, polish);

    expect(segments).toEqual([{
      id: "segment-1",
      speakerLabel: "Speaker 2",
      startMs: 120,
      endMs: 1_900,
      rawText: "आज deploy करेंगे.",
      cleanText: "We will deploy today.",
      romanHinglishText: "Aaj deploy karenge.",
    }]);
  });

  it("falls back to the raw transcript when utterances are unavailable", () => {
    const segments = authoritativeSegments({
      rawTranscript: "Raw fallback",
      language: "multi",
      durationMs: 500,
      utterances: [],
    }, []);
    expect(segments[0]).toMatchObject({
      rawText: "Raw fallback",
      cleanText: "Raw fallback",
      startMs: 0,
      endMs: 500,
    });
  });
});
