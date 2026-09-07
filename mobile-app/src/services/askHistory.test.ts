import { describe, expect, it } from "vitest";
import { buildAskHistory } from "./askHistory";

describe("buildAskHistory", () => {
  it("caps history to the last six completed exchanges", () => {
    const turns = Array.from({ length: 8 }, (_, index) => ({
      question: `question-${index + 1}`,
      answer: `answer-${index + 1}`,
      error: null,
    }));
    const history = buildAskHistory(turns);
    expect(history).toHaveLength(12);
    expect(history[0]).toEqual({ role: "user", content: "question-3" });
    expect(history.at(-1)).toEqual({ role: "assistant", content: "answer-8" });
  });

  it("skips failed or unanswered turns", () => {
    const history = buildAskHistory([
      { question: "first", answer: "done", error: null },
      { question: "second", answer: null, error: "offline" },
      { question: "third", answer: "final", error: null },
    ]);
    expect(history).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "done" },
      { role: "user", content: "third" },
      { role: "assistant", content: "final" },
    ]);
  });
});
