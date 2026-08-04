import { describe, expect, it } from "vitest";
import { nextMeterLevels, normalizeMetering } from "./audioMeter";

describe("audio meter", () => {
  it("gates recorder silence and room noise", () => {
    expect(normalizeMetering(-160)).toBe(0);
    expect(normalizeMetering(-50)).toBe(0);
  });

  it("maps speech and clips loud input", () => {
    expect(normalizeMetering(-25)).toBeGreaterThan(0.3);
    expect(normalizeMetering(0)).toBe(1);
  });

  it("quickly decays old peaks during silence", () => {
    expect(nextMeterLevels([1, 1, 1], 0)).toEqual([0.48, 0.48, 0]);
  });
});
