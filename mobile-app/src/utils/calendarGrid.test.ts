import { describe, expect, it } from "vitest";
import { dayKey, gridRange, groupByStartDay, monthGrid } from "./calendarGrid";

describe("monthGrid", () => {
  it("starts on Monday and covers six weeks", () => {
    const days = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(days).toHaveLength(42);
    expect(days[0]!.date.getDay()).toBe(1);
    expect(days[0]!.key).toBe("2026-09-28");
    expect(days[3]!.key).toBe("2026-10-01");
    expect(days[3]!.inMonth).toBe(true);
    expect(days[2]!.inMonth).toBe(false);
    expect(days.filter((day) => day.inMonth)).toHaveLength(31);
  });

  it("handles months that start on Monday", () => {
    expect(monthGrid(2026, 5)[0]!.key).toBe("2026-06-01"); // June 2026
  });

  it("returns a range spanning the grid", () => {
    const range = gridRange(2026, 9);
    expect(dayKey(range.from)).toBe("2026-09-28");
    expect(dayKey(range.to)).toBe("2026-11-09");
  });
});

describe("groupByStartDay", () => {
  it("groups by local start day, sorted by time", () => {
    const late = { id: "late", start: new Date(2026, 9, 11, 18).toISOString() };
    const early = { id: "early", start: new Date(2026, 9, 11, 9).toISOString() };
    const next = { id: "next", start: new Date(2026, 9, 12, 9).toISOString() };
    const groups = groupByStartDay([late, next, early]);
    expect(groups.get("2026-10-11")?.map((item) => item.id)).toEqual(["early", "late"]);
    expect(groups.get("2026-10-12")?.map((item) => item.id)).toEqual(["next"]);
  });
});
