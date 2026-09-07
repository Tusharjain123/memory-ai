import type { AskHistoryMessage } from "../contracts";

const MAX_HISTORY_EXCHANGES = 6;

export type AskHistoryTurn = {
  question: string;
  answer: string | null;
  error?: string | null;
};

export function buildAskHistory(turns: AskHistoryTurn[]): AskHistoryMessage[] {
  const completed = turns.filter(
    (turn) => turn.answer && !turn.error,
  );
  const recent = completed.slice(-MAX_HISTORY_EXCHANGES);
  return recent.flatMap((turn) => [
    { role: "user" as const, content: turn.question },
    { role: "assistant" as const, content: turn.answer as string },
  ]);
}
