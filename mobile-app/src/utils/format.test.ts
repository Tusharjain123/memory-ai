import { describe, expect, it } from "vitest";
import { formatDuration, formatTimestamp, greeting, relativeDate } from "./format";

describe("display formatting", () => {
  it("formats duration without zero-minute noise", () => {
    expect(formatDuration(12_000)).toBe("1 min");
    expect(formatDuration(3_900_000)).toBe("1 hr 5 min");
  });

  it("formats clip timestamps", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(125_000)).toBe("2:05");
    expect(formatTimestamp(3_600_000)).toBe("1:00:00");
    expect(formatTimestamp(3 * 3_600_000 + 5 * 60_000)).toBe("3:05:00");
  });

  it("uses calm relative dates", () => {
    const now = new Date("2026-08-02T20:00:00");
    expect(relativeDate("2026-08-02T10:00:00", now)).toBe("Today");
    expect(relativeDate("2026-08-01T10:00:00", now)).toBe("Yesterday");
  });

  it("greets according to the local day", () => {
    expect(greeting(new Date("2026-08-02T09:00:00"))).toBe("Good morning");
    expect(greeting(new Date("2026-08-02T20:00:00"))).toBe("Good evening");
  });
});
