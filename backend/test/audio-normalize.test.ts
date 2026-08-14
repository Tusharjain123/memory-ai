import { describe, expect, it } from "vitest";
import { shouldSkipMonoReencode } from "../src/processing/audio-normalize.js";

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
