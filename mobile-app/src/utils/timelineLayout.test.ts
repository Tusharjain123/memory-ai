import { describe, expect, it } from "vitest";
import { initialScrollHour, layoutTimeline } from "./timelineLayout";

const day = new Date(2026, 9, 12);
const at = (hour: number, minute = 0) => new Date(2026, 9, 12, hour, minute).toISOString();
const options = { day, startHour: 7, endHour: 22 };

describe("layoutTimeline", () => {
  it("positions events in minutes from the rail start", () => {
    const [block] = layoutTimeline([{ id: "a", start: at(9), end: at(10, 30) }], options);
    expect(block).toMatchObject({ top: 120, height: 90, column: 0, columns: 1 });
  });

  it("puts overlapping events side by side", () => {
    const blocks = layoutTimeline([
      { id: "a", start: at(9), end: at(10) },
      { id: "b", start: at(9, 30), end: at(10, 30) },
      { id: "c", start: at(11), end: at(12) },
    ], options);
    const byId = Object.fromEntries(blocks.map((block) => [block.item.id, block]));
    expect(byId.a).toMatchObject({ column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ column: 0, columns: 1 });
  });

  it("reuses a freed column inside a cluster", () => {
    const blocks = layoutTimeline([
      { id: "long", start: at(9), end: at(12) },
      { id: "x", start: at(9), end: at(10) },
      { id: "y", start: at(10), end: at(11) },
    ], options);
    const byId = Object.fromEntries(blocks.map((block) => [block.item.id, block]));
    expect(byId.y!.column).toBe(1);
    expect(byId.long!.columns).toBe(2);
  });

  it("clamps to the rail and enforces a minimum height", () => {
    const blocks = layoutTimeline([
      { id: "early", start: at(5), end: at(8) },
      { id: "short", start: at(13), end: at(13, 5) },
      { id: "gone", start: at(4), end: at(6) },
    ], options);
    const byId = Object.fromEntries(blocks.map((block) => [block.item.id, block]));
    expect(byId.early).toMatchObject({ top: 0, height: 60 });
    expect(byId.short!.height).toBe(30);
    expect(byId.gone).toBeUndefined();
  });
});

describe("initialScrollHour", () => {
  it("scrolls near now on today and to the first event otherwise", () => {
    expect(initialScrollHour([], day, new Date(2026, 9, 12, 15, 20), 7)).toBe(14);
    expect(initialScrollHour([{ start: at(11) }], day, new Date(2026, 9, 13), 7)).toBe(10);
    expect(initialScrollHour([], day, new Date(2026, 9, 13), 7)).toBe(8);
  });
});
