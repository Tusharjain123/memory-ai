import { describe, expect, it } from "vitest";
import { GOALS, goalCaption, homePriority, joinGoals, parseGoals } from "./goals";

describe("goals", () => {
  it("round-trips the stored format", () => {
    const stored = joinGoals([GOALS.commitments, " Learn Spanish "]);
    expect(stored).toBe("Stay on top of commitments · Learn Spanish");
    expect(parseGoals(stored)).toEqual([GOALS.commitments, "Learn Spanish"]);
    expect(parseGoals(null)).toEqual([]);
  });

  it("orders Home by what matters", () => {
    expect(homePriority([GOALS.people, GOALS.commitments])).toEqual(["commitments", "people"]);
    expect(homePriority(["Something custom"])).toEqual(["conversations"]);
  });

  it("explains the effect of the choice", () => {
    expect(goalCaption([])).toMatch(/change it later/);
    expect(goalCaption([GOALS.people])).toBe("Home will lead with who you're meeting next.");
  });
});
