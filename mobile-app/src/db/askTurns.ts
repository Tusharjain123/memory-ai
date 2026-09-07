import { randomUUID } from "expo-crypto";
import { getDatabase } from "./database";
import type { AskTurn } from "../services/ai";

type AskTurnRow = {
  id: string;
  conversation_id: string | null;
  question: string;
  answer: string | null;
  citations_json: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function rowToTurn(row: AskTurnRow): AskTurn {
  let citations: string[] = [];
  try {
    const parsed = JSON.parse(row.citations_json) as unknown;
    if (Array.isArray(parsed)) {
      citations = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    citations = [];
  }
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    citations,
    error: row.error,
    loading: false,
  };
}

export async function listAskTurns(conversationId?: string | null): Promise<AskTurn[]> {
  const database = await getDatabase();
  const rows = conversationId
    ? await database.getAllAsync<AskTurnRow>(
        "SELECT * FROM ask_turns WHERE conversation_id = ? ORDER BY created_at ASC",
        conversationId,
      )
    : await database.getAllAsync<AskTurnRow>(
        "SELECT * FROM ask_turns WHERE conversation_id IS NULL ORDER BY created_at ASC",
      );
  return rows.map(rowToTurn);
}

export async function createAskTurn(input: {
  conversationId?: string | null;
  question: string;
}): Promise<string> {
  const database = await getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO ask_turns
      (id, conversation_id, question, answer, citations_json, error, created_at, updated_at)
     VALUES (?, ?, ?, NULL, '[]', NULL, ?, ?)`,
    id,
    input.conversationId ?? null,
    input.question.trim(),
    now,
    now,
  );
  return id;
}

export async function completeAskTurn(
  id: string,
  result: { answer: string; citations: string[] },
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE ask_turns
     SET answer = ?, citations_json = ?, error = NULL, updated_at = ?
     WHERE id = ?`,
    result.answer,
    JSON.stringify(result.citations),
    now,
    id,
  );
}

export async function failAskTurn(id: string, error: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    "UPDATE ask_turns SET error = ?, updated_at = ? WHERE id = ?",
    error,
    now,
    id,
  );
}

export async function clearAskTurns(conversationId?: string | null): Promise<void> {
  const database = await getDatabase();
  if (conversationId) {
    await database.runAsync(
      "DELETE FROM ask_turns WHERE conversation_id = ?",
      conversationId,
    );
    return;
  }
  await database.runAsync("DELETE FROM ask_turns WHERE conversation_id IS NULL");
}
