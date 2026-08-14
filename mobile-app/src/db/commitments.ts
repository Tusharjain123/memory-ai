import type {
  ApprovalStatus,
  CommitmentDirection,
  CommitmentStatus,
  ConfidenceLevel,
  MemoryClass,
} from "../contracts";
import { getDatabase } from "./database";

export type CommitmentRecord = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  text: string;
  direction: CommitmentDirection;
  ownerPersonId: string | null;
  ownerName: string | null;
  counterpartyPersonId: string | null;
  counterpartyName: string | null;
  dueAt: string | null;
  confidence: ConfidenceLevel;
  status: CommitmentStatus;
  memoryClass: MemoryClass;
  approvalStatus: ApprovalStatus;
  segmentId: string | null;
  quote: string | null;
  startMs: number | null;
  speakerLabel: string | null;
  expiresAt: string | null;
  recordingUri: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommitmentFilter = "open" | "mine" | "theirs" | "completed";

type CommitmentRow = {
  id: string;
  conversation_id: string;
  conversation_title: string;
  text: string;
  direction: CommitmentDirection;
  owner_person_id: string | null;
  owner_name: string | null;
  counterparty_person_id: string | null;
  counterparty_name: string | null;
  due_at: string | null;
  confidence: ConfidenceLevel;
  status: CommitmentStatus;
  memory_class: MemoryClass;
  approval_status: ApprovalStatus;
  segment_id: string | null;
  quote: string | null;
  start_ms: number | null;
  speaker_label: string | null;
  expires_at: string | null;
  recording_uri: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: CommitmentRow): CommitmentRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    conversationTitle: row.conversation_title,
    text: row.text,
    direction: row.direction,
    ownerPersonId: row.owner_person_id,
    ownerName: row.owner_name,
    counterpartyPersonId: row.counterparty_person_id,
    counterpartyName: row.counterparty_name,
    dueAt: row.due_at,
    confidence: row.confidence,
    status: row.status,
    memoryClass: row.memory_class,
    approvalStatus: row.approval_status,
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

const SELECT_COMMITMENT = `
SELECT cm.id,cm.conversation_id,c.title conversation_title,cm.text,cm.direction,
       cm.owner_person_id,op.name owner_name,cm.counterparty_person_id,cp.name counterparty_name,
       cm.due_at,cm.confidence,cm.status,cm.memory_class,cm.approval_status,
       cm.segment_id,cm.quote,cm.start_ms,cm.speaker_label,cm.expires_at,
       c.recording_uri,cm.created_at,cm.updated_at
FROM commitments cm
JOIN conversations c ON c.id = cm.conversation_id
LEFT JOIN people op ON op.id = cm.owner_person_id
LEFT JOIN people cp ON cp.id = cm.counterparty_person_id
`;

export async function listCommitments(
  filter: CommitmentFilter = "open",
): Promise<CommitmentRecord[]> {
  const database = await getDatabase();
  const clauses: string[] = ["cm.approval_status IN ('approved','corrected','pending')"];
  if (filter === "open") {
    clauses.push("cm.status IN ('proposed','confirmed')");
    clauses.push("cm.approval_status != 'pending'");
  } else if (filter === "mine") {
    clauses.push("cm.direction IN ('i_owe','mutual')");
    clauses.push("cm.status IN ('proposed','confirmed')");
    clauses.push("cm.approval_status != 'pending'");
  } else if (filter === "theirs") {
    clauses.push("cm.direction IN ('they_owe','mutual')");
    clauses.push("cm.status IN ('proposed','confirmed')");
    clauses.push("cm.approval_status != 'pending'");
  } else {
    clauses.push("cm.status = 'completed'");
  }
  const rows = await database.getAllAsync<CommitmentRow>(
    `${SELECT_COMMITMENT}
     WHERE ${clauses.join(" AND ")}
     ORDER BY
       CASE WHEN cm.due_at IS NULL THEN 1 ELSE 0 END,
       cm.due_at ASC,
       cm.updated_at DESC`,
  );
  return rows.map(mapRow);
}

export async function listCommitmentsForConversation(
  conversationId: string,
): Promise<CommitmentRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CommitmentRow>(
    `${SELECT_COMMITMENT}
     WHERE cm.conversation_id=?
     ORDER BY cm.created_at ASC`,
    conversationId,
  );
  return rows.map(mapRow);
}

export async function listOpenCommitmentsForPerson(
  personId: string,
): Promise<CommitmentRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CommitmentRow>(
    `${SELECT_COMMITMENT}
     WHERE cm.approval_status IN ('approved','corrected')
       AND cm.status IN ('proposed','confirmed')
       AND (cm.owner_person_id=? OR cm.counterparty_person_id=?)
     ORDER BY cm.updated_at DESC`,
    personId,
    personId,
  );
  return rows.map(mapRow);
}

export async function countOpenCommitments(): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) total FROM commitments
     WHERE approval_status IN ('approved','corrected')
       AND status IN ('proposed','confirmed')`,
  );
  return row?.total ?? 0;
}

export async function countPendingReviews(): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) total FROM memory_reviews
     WHERE completed_at IS NULL AND pending_count > 0`,
  );
  return row?.total ?? 0;
}

export async function listPendingReviewConversations(): Promise<Array<{
  conversationId: string;
  title: string;
  pendingCount: number;
  createdAt: string;
}>> {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT mr.conversation_id conversationId, c.title, mr.pending_count pendingCount,
            mr.created_at createdAt
     FROM memory_reviews mr
     JOIN conversations c ON c.id = mr.conversation_id
     WHERE mr.completed_at IS NULL AND mr.pending_count > 0
     ORDER BY mr.created_at DESC`,
  );
}

export async function setCommitmentStatus(
  id: string,
  status: CommitmentStatus,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE commitments SET status=?, updated_at=? WHERE id=?",
    status,
    new Date().toISOString(),
    id,
  );
}

export async function setCommitmentApproval(
  id: string,
  approvalStatus: ApprovalStatus,
  patch?: { text?: string; expiresAt?: string | null },
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const memoryClass =
    approvalStatus === "corrected" || approvalStatus === "approved"
      ? "user_confirmed"
      : undefined;
  if (patch?.text !== undefined && memoryClass) {
    await database.runAsync(
      `UPDATE commitments
       SET approval_status=?, memory_class=?, text=?, expires_at=?, updated_at=?
       WHERE id=?`,
      approvalStatus,
      memoryClass,
      patch.text,
      patch.expiresAt ?? null,
      now,
      id,
    );
    return;
  }
  if (memoryClass) {
    await database.runAsync(
      `UPDATE commitments
       SET approval_status=?, memory_class=?, expires_at=COALESCE(?, expires_at), updated_at=?
       WHERE id=?`,
      approvalStatus,
      memoryClass,
      patch?.expiresAt ?? null,
      now,
      id,
    );
    return;
  }
  await database.runAsync(
    `UPDATE commitments
     SET approval_status=?, expires_at=COALESCE(?, expires_at), updated_at=?
     WHERE id=?`,
    approvalStatus,
    patch?.expiresAt ?? null,
    now,
    id,
  );
}

export type FollowUpBrief = {
  personName: string;
  lastConversationTitle: string | null;
  lastConversationAt: string | null;
  iOwe: string[];
  theyOwe: string[];
  unresolved: string[];
};

export async function getFollowUpBrief(personId: string): Promise<FollowUpBrief | null> {
  const database = await getDatabase();
  const person = await database.getFirstAsync<{ name: string; is_placeholder: number }>(
    "SELECT name, is_placeholder FROM people WHERE id=?",
    personId,
  );
  if (!person) return null;
  const last = await database.getFirstAsync<{
    title: string;
    created_at: string;
    summary: string;
  }>(
    `SELECT c.title, c.created_at, c.summary
     FROM conversations c
     JOIN conversation_people cp ON cp.conversation_id = c.id
     WHERE cp.person_id=?
     ORDER BY c.created_at DESC
     LIMIT 1`,
    personId,
  );
  const commitments = await listOpenCommitmentsForPerson(personId);
  const followUps = await database.getAllAsync<{ text: string }>(
    `SELECT text FROM person_memories
     WHERE person_id=?
       AND kind='follow_up'
       AND approval_status IN ('approved','corrected')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at DESC
     LIMIT 5`,
    personId,
    new Date().toISOString(),
  );
  return {
    personName: person.is_placeholder ? person.name.split(" · ")[0] ?? person.name : person.name,
    lastConversationTitle: last?.title ?? null,
    lastConversationAt: last?.created_at ?? null,
    iOwe: commitments
      .filter((item) => item.direction === "i_owe" || item.direction === "mutual")
      .map((item) => item.text),
    theyOwe: commitments
      .filter((item) => item.direction === "they_owe" || item.direction === "mutual")
      .map((item) => item.text),
    unresolved: followUps.map((item) => item.text),
  };
}
