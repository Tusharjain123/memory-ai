import { describe, expect, it } from "vitest";
import { nextMeterLevels, normalizeMetering } from "./audioMeter";

describe("audio meter", () => {
  it("gates recorder silence and room noise", () => {
    expect(normalizeMetering(-160)).toBe(0);
    expect(normalizeMetering(-55)).toBe(0);
  });

  it("maps speech and clips loud input", () => {
    expect(normalizeMetering(-45)).toBeGreaterThan(0.1);
    expect(normalizeMetering(-25)).toBeGreaterThan(normalizeMetering(-45));
    expect(normalizeMetering(-10)).toBeGreaterThan(normalizeMetering(-25));
    expect(normalizeMetering(0)).toBe(1);
  });

  it("preserves historical peaks in a fixed FIFO window", () => {
    expect(nextMeterLevels([0.2, 0.7, 1], 0)).toEqual([0.7, 1, 0]);
    expect(nextMeterLevels([0.2, 0.7, 1], 0.5)).toEqual([0.7, 1, 0.5]);
  });

  it("clamps invalid visual levels without changing the window size", () => {
    expect(nextMeterLevels([0, 0], 2)).toEqual([0, 1]);
    expect(nextMeterLevels([0, 0], -1)).toEqual([0, 0]);
    expect(nextMeterLevels([], 0.5)).toEqual([]);
  });
});
