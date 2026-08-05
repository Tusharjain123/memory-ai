import { describe, expect, it } from "vitest";
import { nextMeterLevels, normalizeMetering } from "./audioMeter";

describe("audio meter", () => {
  it("gates recorder silence and room noise", () => {
    expect(normalizeMetering(-160)).toBe(0);
    expect(normalizeMetering(-55)).toBe(0);
  });

  it("maps speech and clips loud input", () => {
    expect(normalizeMetering(-45)).toBeGreaterThan(0.1);
    expect(normalizeMetering(-25)).toBeGreaterThan(0.5);
    expect(normalizeMetering(0)).toBe(1);
  });

  it("decays old peaks while adding the latest sample", () => {
    expect(nextMeterLevels([1, 1, 1], 0)).toEqual([0.7, 0.7, 0]);
    expect(nextMeterLevels([1, 1, 1], 0.5)).toEqual([0.9, 0.9, 0.5]);
  });
});
