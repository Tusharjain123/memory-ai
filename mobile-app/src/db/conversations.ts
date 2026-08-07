import type { ProcessedConversation } from "../contracts";
import * as FileSystem from "expo-file-system/legacy";
import { randomUUID } from "expo-crypto";
import { getDatabase } from "./database";
import { storedEntityId } from "./storageIds";

export type ConversationListItem = {
  id: string;
  title: string;
  summary: string;
  topics: string[];
  durationMs: number;
  createdAt: string;
  people: string[];
  actionItemCount: number;
  decisionCount: number;
};

export type ConversationDetail = ConversationListItem & {
  mainGoal: string;
  language: string;
  rawTranscript: string;
  cleanTranscript: string;
  romanHinglishTranscript: string;
  participants: Array<{
    personId: string;
    name: string;
    speakerLabel: string;
    relationship: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    isPlaceholder: boolean;
  }>;
  segments: Array<{
    id: string;
    speakerLabel: string;
    speakerName: string | null;
    startMs: number;
    rawText: string;
    cleanText: string;
    romanHinglishText: string;
  }>;
  decisions: Array<{ id: string; text: string }>;
  actionItems: Array<{
    id: string;
    task: string;
    owner: string | null;
    dueAt: string | null;
    completed: boolean;
  }>;
  recordingUri: string | null;
};

export async function saveConversation(
  result: ProcessedConversation,
  recordingUri: string | null,
  pendingRecordingId?: string,
): Promise<string> {
  const database = await getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO conversations
       (id,title,main_goal,summary,topics_json,language,duration_ms,raw_transcript,
        clean_transcript,roman_hinglish_transcript,recording_uri,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, result.title, result.mainGoal, result.summary, JSON.stringify(result.topics),
      result.language, result.durationMs, result.rawTranscript, result.cleanTranscript,
      result.romanHinglishTranscript, recordingUri, now, now,
    );
    const speakerLabels = new Set([
      ...result.segments.map((segment) => segment.speakerLabel),
      ...result.participants.map((person) => person.speakerLabel),
    ]);
    for (const speakerLabel of speakerLabels) {
      const participant = result.participants.find(
        (person) => person.speakerLabel === speakerLabel,
      );
      const candidateName = participant?.name.trim() ?? "";
      const hasKnownName =
        Boolean(candidateName) && !/^speaker\s+\d+$/i.test(candidateName);
      let personId: string;
      if (hasKnownName) {
        const stored = await database.getFirstAsync<{ id: string }>(
          "SELECT id FROM people WHERE name = ? COLLATE NOCASE",
          candidateName,
        );
        personId = stored?.id ?? randomUUID();
        if (stored) {
          await database.runAsync(
            "UPDATE people SET last_interaction_at=?,updated_at=? WHERE id=?",
            now, now, personId,
          );
        } else {
          await database.runAsync(
            `INSERT INTO people
             (id,name,last_interaction_at,updated_at,is_placeholder)
             VALUES (?,?,?,?,0)`,
            personId, candidateName, now, now,
          );
        }
      } else {
        personId = randomUUID();
        await database.runAsync(
          `INSERT INTO people
           (id,name,last_interaction_at,updated_at,is_placeholder)
           VALUES (?,?,?,?,1)`,
          personId, `${speakerLabel} · ${id}`, now, now,
        );
      }
      await database.runAsync(
        `INSERT OR IGNORE INTO conversation_people
         (conversation_id,person_id,speaker_label) VALUES (?,?,?)`,
        id, personId, speakerLabel,
      );
    }
    for (const segment of result.segments) {
      const segmentId = storedEntityId(id, "segment", segment.id);
      await database.runAsync(
        `INSERT INTO transcript_segments VALUES (?,?,?,?,?,?,?,?)`,
        segmentId, id, segment.speakerLabel, segment.startMs, segment.endMs,
        segment.rawText, segment.cleanText, segment.romanHinglishText,
      );
    }
    for (const decision of result.decisions) {
      await database.runAsync(
        "INSERT INTO decisions VALUES (?,?,?)",
        storedEntityId(id, "decision", decision.id), id, decision.text,
      );
    }
    for (const item of result.actionItems) {
      await database.runAsync(
        "INSERT INTO action_items VALUES (?,?,?,?,?,?)",
        storedEntityId(id, "action", item.id), id, item.task, item.owner, item.dueAt,
        item.completed ? 1 : 0,
      );
    }
    for (const embedding of result.embeddings) {
      const sourceId = embedding.sourceType === "segment"
        ? storedEntityId(id, "segment", embedding.sourceId)
        : `${id}:conversation`;
      await database.runAsync(
        `INSERT INTO embeddings
         (conversation_id,source_type,source_id,text,vector_json,model)
         VALUES (?,?,?,?,?,?)`,
        id, embedding.sourceType, sourceId, embedding.text,
        JSON.stringify(embedding.vector), embedding.model,
      );
    }
    if (pendingRecordingId) {
      await database.runAsync(
        "DELETE FROM pending_recordings WHERE id=?",
        pendingRecordingId,
      );
    }
  });
  return id;
}

export async function listConversations(): Promise<ConversationListItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string; title: string; summary: string; topics_json: string;
    duration_ms: number; created_at: string; people_names: string | null;
    action_count: number; decision_count: number;
  }>(
    `SELECT c.id,c.title,c.summary,c.topics_json,c.duration_ms,c.created_at,
      (SELECT GROUP_CONCAT(
         CASE WHEN p.is_placeholder=1 THEN cp.speaker_label ELSE p.name END, '|'
       ) FROM conversation_people cp
       JOIN people p ON p.id=cp.person_id WHERE cp.conversation_id=c.id) people_names,
      (SELECT COUNT(*) FROM action_items a WHERE a.conversation_id=c.id) action_count,
      (SELECT COUNT(*) FROM decisions d WHERE d.conversation_id=c.id) decision_count
     FROM conversations c ORDER BY c.created_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id, title: row.title, summary: row.summary,
    topics: JSON.parse(row.topics_json) as string[],
    durationMs: row.duration_ms, createdAt: row.created_at,
    people: row.people_names?.split("|").filter(Boolean) ?? [],
    actionItemCount: row.action_count,
    decisionCount: row.decision_count,
  }));
}

export async function deleteConversation(id: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ recording_uri: string | null }>(
    "SELECT recording_uri FROM conversations WHERE id=?", id,
  );
  await database.runAsync("DELETE FROM conversations WHERE id=?", id);
  if (row?.recording_uri) {
    await FileSystem.deleteAsync(row.recording_uri, { idempotent: true });
  }
}

export async function deleteRecording(id: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ recording_uri: string | null }>(
    "SELECT recording_uri FROM conversations WHERE id=?", id,
  );
  if (row?.recording_uri) {
    await FileSystem.deleteAsync(row.recording_uri, { idempotent: true });
    await database.runAsync(
      "UPDATE conversations SET recording_uri=NULL,updated_at=? WHERE id=?",
      new Date().toISOString(), id,
    );
  }
}

export async function setActionItemCompleted(id: string, completed: boolean): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE action_items SET completed=? WHERE id=?",
    completed ? 1 : 0, id,
  );
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string; title: string; main_goal: string; summary: string; topics_json: string;
    language: string; duration_ms: number; raw_transcript: string;
    clean_transcript: string; roman_hinglish_transcript: string; created_at: string;
    recording_uri: string | null;
  }>("SELECT * FROM conversations WHERE id=?", id);
  if (!row) return null;
  const [participants, segments, decisions, actions] = await Promise.all([
    database.getAllAsync<{
      person_id: string;
      name: string;
      speaker_label: string;
      relationship: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
      is_placeholder: number;
    }>(
      `SELECT p.id person_id,p.name,cp.speaker_label,p.relationship,p.email,
              p.phone,p.notes,p.is_placeholder
       FROM people p JOIN conversation_people cp
       ON cp.person_id=p.id WHERE cp.conversation_id=?`, id,
    ),
    database.getAllAsync<{
      id: string;
      speaker_label: string;
      start_ms: number;
      raw_text: string;
      clean_text: string;
      roman_hinglish_text: string;
    }>(
      `SELECT id,speaker_label,start_ms,raw_text,clean_text,roman_hinglish_text
       FROM transcript_segments
       WHERE conversation_id=? ORDER BY start_ms`, id,
    ),
    database.getAllAsync<{ id: string; text: string }>(
      "SELECT id,text FROM decisions WHERE conversation_id=?", id,
    ),
    database.getAllAsync<{
      id: string; task: string; owner: string | null; due_at: string | null; completed: number;
    }>("SELECT id,task,owner,due_at,completed FROM action_items WHERE conversation_id=?", id),
  ]);
  const peopleBySpeaker = new Map(
    participants.map((item) => [item.speaker_label, item] as const),
  );
  return {
    id: row.id, title: row.title, mainGoal: row.main_goal, summary: row.summary,
    topics: JSON.parse(row.topics_json) as string[], language: row.language,
    durationMs: row.duration_ms, rawTranscript: row.raw_transcript,
    cleanTranscript: row.clean_transcript,
    romanHinglishTranscript: row.roman_hinglish_transcript, createdAt: row.created_at,
    recordingUri: row.recording_uri,
    people: participants.map((item) =>
      item.is_placeholder ? item.speaker_label : item.name
    ),
    actionItemCount: actions.length,
    decisionCount: decisions.length,
    participants: participants.map((item) => ({
      personId: item.person_id,
      name: item.is_placeholder ? item.speaker_label : item.name,
      speakerLabel: item.speaker_label,
      relationship: item.relationship,
      email: item.email,
      phone: item.phone,
      notes: item.notes,
      isPlaceholder: item.is_placeholder === 1,
    })),
    segments: segments.map((item) => ({
      id: item.id, speakerLabel: item.speaker_label,
      speakerName: peopleBySpeaker.get(item.speaker_label)?.is_placeholder
        ? null
        : peopleBySpeaker.get(item.speaker_label)?.name ?? null,
      startMs: item.start_ms,
      rawText: item.raw_text,
      cleanText: item.clean_text,
      romanHinglishText: item.roman_hinglish_text,
    })),
    decisions,
    actionItems: actions.map((item) => ({
      id: item.id, task: item.task, owner: item.owner, dueAt: item.due_at,
      completed: item.completed === 1,
    })),
  };
}
