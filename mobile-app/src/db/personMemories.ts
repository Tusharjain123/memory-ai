import type {
  ApprovalStatus,
  ConfidenceLevel,
  MemoryCandidateKind,
  MemoryClass,
} from "../contracts";
import { getDatabase } from "./database";

export type PersonMemoryRecord = {
  id: string;
  personId: string | null;
  personName: string | null;
  conversationId: string;
  conversationTitle: string;
  kind: MemoryCandidateKind;
  text: string;
  memoryClass: MemoryClass;
  approvalStatus: ApprovalStatus;
  confidence: ConfidenceLevel;
  segmentId: string | null;
  quote: string | null;
  startMs: number | null;
  speakerLabel: string | null;
  expiresAt: string | null;
  recordingUri: string | null;
  createdAt: string;
  updatedAt: string;
};

type PersonMemoryRow = {
  id: string;
  person_id: string | null;
  person_name: string | null;
  conversation_id: string;
  conversation_title: string;
  kind: MemoryCandidateKind;
  text: string;
  memory_class: MemoryClass;
  approval_status: ApprovalStatus;
  confidence: ConfidenceLevel;
  segment_id: string | null;
  quote: string | null;
  start_ms: number | null;
  speaker_label: string | null;
  expires_at: string | null;
  recording_uri: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: PersonMemoryRow): PersonMemoryRecord {
  return {
    id: row.id,
    personId: row.person_id,
    personName: row.person_name,
    conversationId: row.conversation_id,
    conversationTitle: row.conversation_title,
    kind: row.kind,
    text: row.text,
    memoryClass: row.memory_class,
    approvalStatus: row.approval_status,
    confidence: row.confidence,
    segmentId: row.segment_id,
    quote: row.quote,
    startMs: row.start_ms,
    speakerLabel: row.speaker_label,
    expiresAt: row.expires_at,
    recordingUri: row.recording_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `
SELECT pm.id,pm.person_id,p.name person_name,pm.conversation_id,c.title conversation_title,
       pm.kind,pm.text,pm.memory_class,pm.approval_status,pm.confidence,
       pm.segment_id,pm.quote,pm.start_ms,pm.speaker_label,pm.expires_at,
       c.recording_uri,pm.created_at,pm.updated_at
FROM person_memories pm
JOIN conversations c ON c.id = pm.conversation_id
LEFT JOIN people p ON p.id = pm.person_id
`;

export async function listPersonMemoriesForPerson(
  personId: string,
  approvedOnly = true,
): Promise<PersonMemoryRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PersonMemoryRow>(
    `${SELECT}
     WHERE pm.person_id=?
       ${approvedOnly ? "AND pm.approval_status IN ('approved','corrected')" : ""}
       AND (pm.expires_at IS NULL OR pm.expires_at > ?)
       AND pm.approval_status != 'sensitive'
     ORDER BY pm.updated_at DESC`,
    personId,
    new Date().toISOString(),
  );
  return rows.map(mapRow);
}

export async function listPendingMemoriesForConversation(
  conversationId: string,
): Promise<PersonMemoryRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PersonMemoryRow>(
    `${SELECT}
     WHERE pm.conversation_id=? AND pm.approval_status='pending'
     ORDER BY pm.created_at ASC`,
    conversationId,
  );
  return rows.map(mapRow);
}

export async function setPersonMemoryApproval(
  id: string,
  approvalStatus: ApprovalStatus,
  patch?: {
    text?: string;
    personId?: string | null;
    expiresAt?: string | null;
  },
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const memoryClass =
    approvalStatus === "approved" || approvalStatus === "corrected"
      ? "user_confirmed"
      : undefined;
  await database.runAsync(
    `UPDATE person_memories
     SET approval_status=?,
         memory_class=COALESCE(?, memory_class),
         text=COALESCE(?, text),
         person_id=COALESCE(?, person_id),
         expires_at=COALESCE(?, expires_at),
         updated_at=?
     WHERE id=?`,
    approvalStatus,
    memoryClass ?? null,
    patch?.text ?? null,
    patch?.personId ?? null,
    patch?.expiresAt ?? null,
    now,
    id,
  );
}

export async function listApprovedMemoriesForRetrieval(
  limit = 40,
): Promise<PersonMemoryRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PersonMemoryRow>(
    `${SELECT}
     WHERE pm.approval_status IN ('approved','corrected')
       AND pm.approval_status != 'sensitive'
       AND (pm.expires_at IS NULL OR pm.expires_at > ?)
     ORDER BY pm.updated_at DESC
     LIMIT ?`,
    new Date().toISOString(),
    limit,
  );
  return rows.map(mapRow);
}

export type PersonPrepBrief = {
  personId: string;
  personName: string;
  lastConversation: {
    id: string;
    title: string;
    summary: string;
    createdAt: string;
  } | null;
  openPromises: Array<{ text: string; direction: string; dueAt: string | null }>;
  decisions: string[];
  topics: string[];
  facts: Array<{ text: string; memoryClass: MemoryClass; kind: MemoryCandidateKind }>;
  followUps: string[];
};

export async function getPersonPrepBrief(personId: string): Promise<PersonPrepBrief | null> {
  const database = await getDatabase();
  const person = await database.getFirstAsync<{
    id: string;
    name: string;
    is_placeholder: number;
  }>("SELECT id, name, is_placeholder FROM people WHERE id=?", personId);
  if (!person) return null;

  const last = await database.getFirstAsync<{
    id: string;
    title: string;
    summary: string;
    created_at: string;
    topics_json: string;
  }>(
    `SELECT c.id, c.title, c.summary, c.created_at, c.topics_json
     FROM conversations c
     JOIN conversation_people cp ON cp.conversation_id = c.id
     WHERE cp.person_id=?
     ORDER BY c.created_at DESC
     LIMIT 1`,
    personId,
  );

  const commitments = await database.getAllAsync<{
    text: string;
    direction: string;
    due_at: string | null;
  }>(
    `SELECT text, direction, due_at FROM commitments
     WHERE approval_status IN ('approved','corrected')
       AND status IN ('proposed','confirmed')
       AND (owner_person_id=? OR counterparty_person_id=?)
     ORDER BY updated_at DESC`,
    personId,
    personId,
  );

  const decisions = await database.getAllAsync<{ text: string }>(
    `SELECT d.text FROM decisions d
     JOIN conversation_people cp ON cp.conversation_id = d.conversation_id
     WHERE cp.person_id=?
       AND d.approval_status IN ('approved','corrected')
     ORDER BY d.conversation_id DESC
     LIMIT 12`,
    personId,
  );

  const topicCounts = new Map<string, number>();
  const topicRows = await database.getAllAsync<{ topics_json: string }>(
    `SELECT c.topics_json FROM conversations c
     JOIN conversation_people cp ON cp.conversation_id = c.id
     WHERE cp.person_id=?`,
    personId,
  );
  for (const row of topicRows) {
    for (const topic of JSON.parse(row.topics_json) as string[]) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  const memories = await listPersonMemoriesForPerson(personId, true);
  const displayName = person.is_placeholder
    ? person.name.split(" · ")[0] ?? person.name
    : person.name;

  return {
    personId: person.id,
    personName: displayName,
    lastConversation: last
      ? {
          id: last.id,
          title: last.title,
          summary: last.summary,
          createdAt: last.created_at,
        }
      : null,
    openPromises: commitments.map((item) => ({
      text: item.text,
      direction: item.direction,
      dueAt: item.due_at,
    })),
    decisions: decisions.map((item) => item.text),
    topics: [...topicCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([topic]) => topic),
    facts: memories
      .filter((item) => item.kind === "preference" || item.kind === "fact")
      .map((item) => ({
        text: item.text,
        memoryClass: item.memoryClass,
        kind: item.kind,
      })),
    followUps: memories
      .filter((item) => item.kind === "follow_up")
      .map((item) => item.text),
  };
}
