import { describe, expect, it } from "vitest";
import { answerLocalAnalytics } from "../search/localAnalytics";
import type { SearchMemory } from "../db/insights";

const analytics: SearchMemory = {
  id: "current",
  conversationId: "analytics",
  title: "Current local analytics",
  text: [
    "Total conversations: 12",
    "Unique people: 7",
    "Pending tasks: 3",
    "Completed tasks: 9",
  ].join("\n"),
  score: 1,
};

describe("answerLocalAnalytics", () => {
  it.each([
    ["How many people have I met?", "You have interacted with 7 unique people."],
    ["What is the total number of meetings?", "You have 12 recorded conversations."],
    ["How many pending tasks are there?", "You have 3 pending tasks."],
    ["How many completed action items?", "You have completed 9 tasks."],
  ])("answers %s from SQLite analytics", (question, expected) => {
    expect(answerLocalAnalytics(question, [analytics])).toEqual({
      answer: expected,
      citations: ["analytics:current"],
    });
  });

  it("defers semantic questions to the AI provider", () => {
    expect(answerLocalAnalytics("What did Rahul say?", [analytics])).toBeNull();
  });
});
