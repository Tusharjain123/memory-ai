import { describe, expect, it } from "vitest";
import { shouldSkipMonoReencode, shouldSkipVolumeDetect } from "../src/processing/audio-normalize.js";

describe("shouldSkipMonoReencode", () => {
  it("skips when capture is mono and loud enough", () => {
    expect(shouldSkipMonoReencode(1, -20)).toBe(true);
    expect(shouldSkipMonoReencode(1, -28)).toBe(true);
  });

  it("re-encodes when mono but quiet or stereo/unknown", () => {
    expect(shouldSkipMonoReencode(1, -30)).toBe(false);
    expect(shouldSkipMonoReencode(2, -20)).toBe(false);
    expect(shouldSkipMonoReencode(null, -20)).toBe(false);
  });
});

describe("shouldSkipVolumeDetect", () => {
  it("skips the full-file volume scan for mono capture", () => {
    expect(shouldSkipVolumeDetect(1)).toBe(true);
    expect(shouldSkipVolumeDetect(2)).toBe(false);
    expect(shouldSkipVolumeDetect(null)).toBe(false);
  });
});
