import type { AskResponse } from "../contracts";

export type AnalyticsMemory = {
  id: string;
  conversationId: string;
  text: string;
};

export function answerLocalAnalytics(
  question: string,
  memories: AnalyticsMemory[],
): AskResponse | null {
  const analytics = memories.find(
    (memory) => memory.conversationId === "analytics",
  );
  if (!analytics) return null;
  const values = Object.fromEntries(
    analytics.text.split("\n").map((line) => {
      const separator = line.indexOf(":");
      return separator < 0
        ? [line.toLowerCase(), ""]
        : [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()];
    }),
  );
  const normalized = question.toLowerCase().replace(/[?!.,]/g, " ");
  let answer: string | null = null;
  if (/\b(how many|number of|total)\b.*\b(people|persons|participants)\b/.test(normalized)) {
    answer = `You have interacted with ${values["unique people"] ?? "0"} unique people.`;
  } else if (/\b(how many|number of|total)\b.*\b(conversations|meetings)\b/.test(normalized)) {
    answer = `You have ${values["total conversations"] ?? "0"} recorded conversations.`;
  } else if (/\b(how many|number of|total)\b.*\b(pending|open|incomplete)\b.*\b(tasks|actions|action items|commitments)\b/.test(normalized)) {
    answer = `You have ${values["pending tasks"] ?? "0"} pending tasks.`;
  } else if (/\b(how many|number of|total)\b.*\b(completed|done|finished)\b.*\b(tasks|actions|action items|commitments)\b/.test(normalized)) {
    answer = `You have completed ${values["completed tasks"] ?? "0"} tasks.`;
  }
  return answer
    ? { answer, citations: [`${analytics.conversationId}:${analytics.id}`] }
    : null;
}
