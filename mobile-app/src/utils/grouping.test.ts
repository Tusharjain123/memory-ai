import { describe, expect, it } from "vitest";
import { filterConversations, groupByDay } from "./grouping";

const base = { summary: "", people: [] as string[], source: "recording" as const, pendingReviewCount: 0 };

describe("groupByDay", () => {
  it("buckets by local day and keeps newest first", () => {
    const now = new Date(2026, 9, 11, 0, 30);
    const groups = groupByDay([
      { id: "older", createdAt: new Date(2026, 8, 1).toISOString() },
      { id: "today", createdAt: new Date(2026, 9, 11, 0, 5).toISOString() },
      { id: "late-yesterday", createdAt: new Date(2026, 9, 10, 23, 59).toISOString() },
      { id: "week", createdAt: new Date(2026, 9, 6, 12).toISOString() },
    ], now);
    expect(groups.map((group) => [group.title, group.items.map((item) => item.id)])).toEqual([
      ["Today", ["today"]],
      ["Yesterday", ["late-yesterday"]],
      ["This week", ["week"]],
      ["Earlier", ["older"]],
    ]);
  });

  it("omits empty buckets", () => {
    expect(groupByDay([], new Date())).toEqual([]);
  });
});

describe("filterConversations", () => {
  const items = [
    { ...base, title: "Roadmap call", people: ["Asha Rao"] },
    { ...base, title: "Client demo", source: "google_meet" as const, summary: "Pricing for Acme" },
    { ...base, title: "1:1", pendingReviewCount: 2 },
  ];

  it("filters by source and review state", () => {
    expect(filterConversations(items, { filter: "meet" }).map((item) => item.title)).toEqual(["Client demo"]);
    expect(filterConversations(items, { filter: "recordings" })).toHaveLength(2);
    expect(filterConversations(items, { filter: "review" }).map((item) => item.title)).toEqual(["1:1"]);
  });

  it("matches every query term across title, summary and people", () => {
    expect(filterConversations(items, { query: "asha roadmap" }).map((item) => item.title)).toEqual(["Roadmap call"]);
    expect(filterConversations(items, { query: "acme" }).map((item) => item.title)).toEqual(["Client demo"]);
    expect(filterConversations(items, { query: "nothing" })).toEqual([]);
  });
});
