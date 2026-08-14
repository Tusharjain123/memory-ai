import { describe, expect, it } from "vitest";
import { rebuildUtterancesFromWords } from "../src/processing/diarization.js";
import { isWeakTranscript } from "../src/processing/audio-normalize.js";

describe("rebuildUtterancesFromWords", () => {
  it("splits turns whenever speaker changes mid-stream", () => {
    const turns = rebuildUtterancesFromWords([
      { word: "Namaste", start: 0, end: 0.5, speaker: 0 },
      { word: "dost", start: 0.5, end: 0.9, speaker: 0 },
      { word: "Kaise", start: 1.0, end: 1.3, speaker: 1 },
      { word: "ho", start: 1.3, end: 1.5, speaker: 1 },
      { word: "Theek", start: 1.6, end: 2.0, speaker: 2 },
      { word: "hai", start: 2.0, end: 2.3, speaker: 2 },
    ]);
    expect(turns).toEqual([
      { speaker: 0, startMs: 0, endMs: 900, text: "Namaste dost" },
      { speaker: 1, startMs: 1000, endMs: 1500, text: "Kaise ho" },
      { speaker: 2, startMs: 1600, endMs: 2300, text: "Theek hai" },
    ]);
  });

  it("merges ultra-short single-token speaker flips into the previous turn", () => {
    const turns = rebuildUtterancesFromWords([
      { word: "Let's", start: 0, end: 0.3, speaker: 0 },
      { word: "ship", start: 0.3, end: 0.6, speaker: 0 },
      { word: "hmm", start: 0.61, end: 0.8, speaker: 1 },
      { word: "today", start: 0.85, end: 1.2, speaker: 0 },
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.text).toBe("Let's ship hmm");
    expect(turns[0]?.speaker).toBe(0);
    expect(turns[1]?.text).toBe("today");
    expect(turns[1]?.speaker).toBe(0);
  });

  it("returns empty when words lack timings", () => {
    expect(rebuildUtterancesFromWords([
      { word: "hi", speaker: 0 },
    ])).toEqual([]);
  });
});

describe("isWeakTranscript", () => {
  it("flags empty and sparse transcripts", () => {
    expect(isWeakTranscript("", 30_000)).toBe(true);
    expect(isWeakTranscript("hm", 60_000)).toBe(true);
    expect(isWeakTranscript("Aaj hum deploy karenge aur review bhi karenge.", 10_000)).toBe(false);
  });
});
