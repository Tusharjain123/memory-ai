import { describe, expect, it } from "vitest";
import { EVIDENCE_CLIP_MS, playbackAutoStopMs } from "./playback";

describe("playbackAutoStopMs", () => {
  it("auto-stops evidence clips after 12 seconds", () => {
    expect(playbackAutoStopMs("clip")).toBe(EVIDENCE_CLIP_MS);
    expect(EVIDENCE_CLIP_MS).toBe(12_000);
  });

  it("does not auto-stop full recording playback", () => {
    expect(playbackAutoStopMs("full")).toBeNull();
  });
});
