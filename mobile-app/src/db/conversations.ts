import type {
  CommitmentInsight,
  ConfidenceLevel,
  DecisionInsight,
  MemoryCandidateInsight,
  ProcessedConversation,
} from "../contracts";
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
  commitmentCount: number;
  decisionCount: number;
  pendingReviewCount: number;
};

export type ConversationDecision = {
  id: string;
  text: string;
  confidence: ConfidenceLevel;
  segmentId: string | null;
  quote: string | null;
  startMs: number | null;
  speakerLabel: string | null;
  approvalStatus: string;
  memoryClass: string;
};

export type ConversationCommitment = {
  id: string;
  text: string;
  direction: string;
  ownerName: string | null;
  counterpartyName: string | null;
  dueAt: string | null;
  confidence: ConfidenceLevel;
  status: string;
  approvalStatus: string;
  memoryClass: string;
  segmentId: string | null;
  quote: string | null;
  startMs: number | null;
  speakerLabel: string | null;
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
    endMs: number;
    rawText: string;
    cleanText: string;
    romanHinglishText: string;
  }>;
  decisions: ConversationDecision[];
  commitments: ConversationCommitment[];
  actionItems: Array<{
    id: string;
    task: string;
    owner: string | null;
    dueAt: string | null;
    completed: boolean;
  }>;
  recordingUri: string | null;
};

async function resolvePersonIdByName(
  database: Awaited<ReturnType<typeof getDatabase>>,
  name: string | null | undefined,
  now: string,
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed || /^speaker\s+\d+$/i.test(trimmed)) return null;
  const stored = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM people WHERE name = ? COLLATE NOCASE",
    trimmed,
  );
  if (stored) {
    await database.runAsync(
      "UPDATE people SET last_interaction_at=?,updated_at=? WHERE id=?",
      now,
      now,
      stored.id,
    );
    return stored.id;
  }
  const personId = randomUUID();
  await database.runAsync(
    `INSERT INTO people
     (id,name,last_interaction_at,updated_at,is_placeholder)
     VALUES (?,?,?,?,0)`,
    personId,
    trimmed,
    now,
    now,
  );
  return personId;
}

function normalizeCommitments(result: ProcessedConversation): CommitmentInsight[] {
  if (result.commitments?.length) return result.commitments;
  return result.actionItems.map((item) => ({
    id: item.id,
    text: item.task,
    direction: "unclear" as const,
    ownerName: item.owner,
    counterpartyName: null,
    dueAt: item.dueAt,
    confidence: "medium" as const,
    status: item.completed ? ("completed" as const) : ("proposed" as const),
    segmentId: null,
    quote: null,
    startMs: null,
    speakerLabel: null,
  }));
}

function normalizeDecisions(result: ProcessedConversation): DecisionInsight[] {
  return result.decisions.map((decision) => ({
    id: decision.id,
    text: decision.text,
    confidence: decision.confidence ?? "medium",
    segmentId: decision.segmentId ?? null,
    quote: decision.quote ?? null,
    startMs: decision.startMs ?? null,
    speakerLabel: decision.speakerLabel ?? null,
  }));
}

function normalizeMemoryCandidates(
  result: ProcessedConversation,
): MemoryCandidateInsight[] {
  return result.memoryCandidates ?? [];
}

export async function saveConversation(
  result: ProcessedConversation,
  recordingUri: string | null,
  pendingRecordingId?: string,
): Promise<string> {
  const database = await getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const commitments = normalizeCommitments(result);
  const decisions = normalizeDecisions(result);
  const memoryCandidates = normalizeMemoryCandidates(result);
  let pendingCount = 0;

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
    const peopleByName = new Map<string, string>();
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
        peopleByName.set(candidateName.toLocaleLowerCase(), personId);
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

    const segmentIdMap = new Map<string, string>();
    for (const segment of result.segments) {
      const segmentId = storedEntityId(id, "segment", segment.id);
      segmentIdMap.set(segment.id, segmentId);
      await database.runAsync(
        `INSERT INTO transcript_segments VALUES (?,?,?,?,?,?,?,?)`,
        segmentId, id, segment.speakerLabel, segment.startMs, segment.endMs,
        segment.rawText, segment.cleanText, segment.romanHinglishText,
      );
    }

    for (const decision of decisions) {
      const decisionId = storedEntityId(id, "decision", decision.id);
      pendingCount += 1;
      await database.runAsync(
        `INSERT INTO decisions
         (id,conversation_id,text,confidence,segment_id,quote,start_ms,speaker_label,memory_class,approval_status)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        decisionId,
        id,
        decision.text,
        decision.confidence,
        decision.segmentId ? segmentIdMap.get(decision.segmentId) ?? null : null,
        decision.quote,
        decision.startMs,
        decision.speakerLabel,
        "ai_inference",
        "pending",
      );
    }

    for (const item of commitments) {
      const commitmentId = storedEntityId(id, "commitment", item.id);
      pendingCount += 1;
      let ownerId = item.ownerName
        ? peopleByName.get(item.ownerName.toLocaleLowerCase()) ?? null
        : null;
      if (!ownerId && item.ownerName) {
        ownerId = await resolvePersonIdByName(database, item.ownerName, now);
        if (ownerId) peopleByName.set(item.ownerName.toLocaleLowerCase(), ownerId);
      }
      let counterpartyId = item.counterpartyName
        ? peopleByName.get(item.counterpartyName.toLocaleLowerCase()) ?? null
        : null;
      if (!counterpartyId && item.counterpartyName) {
        counterpartyId = await resolvePersonIdByName(database, item.counterpartyName, now);
        if (counterpartyId) {
          peopleByName.set(item.counterpartyName.toLocaleLowerCase(), counterpartyId);
        }
      }
      await database.runAsync(
        `INSERT INTO commitments
         (id,conversation_id,text,direction,owner_person_id,counterparty_person_id,due_at,
          confidence,status,memory_class,approval_status,segment_id,quote,start_ms,speaker_label,
          expires_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        commitmentId,
        id,
        item.text,
        item.direction,
        ownerId,
        counterpartyId,
        item.dueAt,
        item.confidence,
        item.status,
        "ai_inference",
        "pending",
        item.segmentId ? segmentIdMap.get(item.segmentId) ?? null : null,
        item.quote,
        item.startMs,
        item.speakerLabel,
        null,
        now,
        now,
      );
      // Keep legacy action_items in sync for older analytics helpers.
      await database.runAsync(
        "INSERT INTO action_items VALUES (?,?,?,?,?,?)",
        storedEntityId(id, "action", item.id),
        id,
        item.text,
        item.ownerName,
        item.dueAt,
        item.status === "completed" ? 1 : 0,
      );
    }

    for (const candidate of memoryCandidates) {
      const memoryId = storedEntityId(id, "memory", candidate.id);
      pendingCount += 1;
      let personId = candidate.personName
        ? peopleByName.get(candidate.personName.toLocaleLowerCase()) ?? null
        : null;
      if (!personId && candidate.personName) {
        personId = await resolvePersonIdByName(database, candidate.personName, now);
      }
      await database.runAsync(
        `INSERT INTO person_memories
         (id,person_id,conversation_id,kind,text,memory_class,approval_status,confidence,
          segment_id,quote,start_ms,speaker_label,expires_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        memoryId,
        personId,
        id,
        candidate.kind,
        candidate.text,
        candidate.memoryClass,
        "pending",
        candidate.confidence,
        candidate.segmentId ? segmentIdMap.get(candidate.segmentId) ?? null : null,
        candidate.quote,
        candidate.startMs,
        candidate.speakerLabel,
        null,
        now,
        now,
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

    await database.runAsync(
      `INSERT INTO memory_reviews (conversation_id, pending_count, completed_at, created_at)
       VALUES (?,?,?,?)`,
      id,
      pendingCount,
      pendingCount === 0 ? now : null,
      now,
    );

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
    action_count: number; commitment_count: number; decision_count: number;
    pending_review_count: number;
  }>(
    `SELECT c.id,c.title,c.summary,c.topics_json,c.duration_ms,c.created_at,
      (SELECT GROUP_CONCAT(
         CASE WHEN p.is_placeholder=1 THEN cp.speaker_label ELSE p.name END, '|'
       ) FROM conversation_people cp
       JOIN people p ON p.id=cp.person_id WHERE cp.conversation_id=c.id) people_names,
      (SELECT COUNT(*) FROM commitments cm
        WHERE cm.conversation_id=c.id
          AND cm.status IN ('proposed','confirmed')
          AND cm.approval_status IN ('approved','corrected','pending')) action_count,
      (SELECT COUNT(*) FROM commitments cm WHERE cm.conversation_id=c.id) commitment_count,
      (SELECT COUNT(*) FROM decisions d WHERE d.conversation_id=c.id) decision_count,
      (SELECT COALESCE(pending_count,0) FROM memory_reviews mr
        WHERE mr.conversation_id=c.id AND mr.completed_at IS NULL) pending_review_count
     FROM conversations c ORDER BY c.created_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id, title: row.title, summary: row.summary,
    topics: JSON.parse(row.topics_json) as string[],
    durationMs: row.duration_ms, createdAt: row.created_at,
    people: row.people_names?.split("|").filter(Boolean) ?? [],
    actionItemCount: row.action_count,
    commitmentCount: row.commitment_count,
    decisionCount: row.decision_count,
    pendingReviewCount: row.pending_review_count ?? 0,
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

/** @deprecated Use setCommitmentStatus from commitments.ts */
export async function setActionItemCompleted(id: string, completed: boolean): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE action_items SET completed=? WHERE id=?",
    completed ? 1 : 0, id,
  );
  const commitmentId = id.includes(":action:")
    ? id.replace(":action:", ":commitment:")
    : id;
  await database.runAsync(
    "UPDATE commitments SET status=?, updated_at=? WHERE id=? OR id=?",
    completed ? "completed" : "proposed",
    new Date().toISOString(),
    commitmentId,
    id,
  );
}

export async function refreshMemoryReviewCount(conversationId: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ total: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM commitments WHERE conversation_id=? AND approval_status='pending')
       + (SELECT COUNT(*) FROM decisions WHERE conversation_id=? AND approval_status='pending')
       + (SELECT COUNT(*) FROM person_memories WHERE conversation_id=? AND approval_status='pending')
     ) total`,
    conversationId,
    conversationId,
    conversationId,
  );
  const pending = row?.total ?? 0;
  await database.runAsync(
    `UPDATE memory_reviews
     SET pending_count=?, completed_at=?
     WHERE conversation_id=?`,
    pending,
    pending === 0 ? new Date().toISOString() : null,
    conversationId,
  );
}

export async function setDecisionApproval(
  id: string,
  approvalStatus: string,
  patch?: { text?: string },
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE decisions
     SET approval_status=?,
         memory_class=CASE WHEN ? IN ('approved','corrected') THEN 'user_confirmed' ELSE memory_class END,
         text=COALESCE(?, text)
     WHERE id=?`,
    approvalStatus,
    approvalStatus,
    patch?.text ?? null,
    id,
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
  const [participants, segments, decisions, commitments, review] = await Promise.all([
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
      end_ms: number;
      raw_text: string;
      clean_text: string;
      roman_hinglish_text: string;
    }>(
      `SELECT id,speaker_label,start_ms,end_ms,raw_text,clean_text,roman_hinglish_text
       FROM transcript_segments
       WHERE conversation_id=? ORDER BY start_ms`, id,
    ),
    database.getAllAsync<{
      id: string;
      text: string;
      confidence: ConfidenceLevel;
      segment_id: string | null;
      quote: string | null;
      start_ms: number | null;
      speaker_label: string | null;
      approval_status: string;
      memory_class: string;
    }>(
      `SELECT id,text,confidence,segment_id,quote,start_ms,speaker_label,approval_status,memory_class
       FROM decisions WHERE conversation_id=?`, id,
    ),
    database.getAllAsync<{
      id: string;
      text: string;
      direction: string;
      owner_name: string | null;
      counterparty_name: string | null;
      due_at: string | null;
      confidence: ConfidenceLevel;
      status: string;
      approval_status: string;
      memory_class: string;
      segment_id: string | null;
      quote: string | null;
      start_ms: number | null;
      speaker_label: string | null;
    }>(
      `SELECT cm.id,cm.text,cm.direction,op.name owner_name,cp.name counterparty_name,
              cm.due_at,cm.confidence,cm.status,cm.approval_status,cm.memory_class,
              cm.segment_id,cm.quote,cm.start_ms,cm.speaker_label
       FROM commitments cm
       LEFT JOIN people op ON op.id = cm.owner_person_id
       LEFT JOIN people cp ON cp.id = cm.counterparty_person_id
       WHERE cm.conversation_id=?`,
      id,
    ),
    database.getFirstAsync<{ pending_count: number }>(
      "SELECT pending_count FROM memory_reviews WHERE conversation_id=?",
      id,
    ),
  ]);
  const peopleBySpeaker = new Map(
    participants.map((item) => [item.speaker_label, item] as const),
  );
  const mappedCommitments: ConversationCommitment[] = commitments.map((item) => ({
    id: item.id,
    text: item.text,
    direction: item.direction,
    ownerName: item.owner_name,
    counterpartyName: item.counterparty_name,
    dueAt: item.due_at,
    confidence: item.confidence,
    status: item.status,
    approvalStatus: item.approval_status,
    memoryClass: item.memory_class,
    segmentId: item.segment_id,
    quote: item.quote,
    startMs: item.start_ms,
    speakerLabel: item.speaker_label,
  }));
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
    actionItemCount: mappedCommitments.filter(
      (item) => item.status === "proposed" || item.status === "confirmed",
    ).length,
    commitmentCount: mappedCommitments.length,
    decisionCount: decisions.length,
    pendingReviewCount: review?.pending_count ?? 0,
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
      endMs: item.end_ms,
      rawText: item.raw_text,
      cleanText: item.clean_text,
      romanHinglishText: item.roman_hinglish_text,
    })),
    decisions: decisions.map((item) => ({
      id: item.id,
      text: item.text,
      confidence: item.confidence,
      segmentId: item.segment_id,
      quote: item.quote,
      startMs: item.start_ms,
      speakerLabel: item.speaker_label,
      approvalStatus: item.approval_status,
      memoryClass: item.memory_class,
    })),
    commitments: mappedCommitments,
    actionItems: mappedCommitments.map((item) => ({
      id: item.id,
      task: item.text,
      owner: item.ownerName,
      dueAt: item.dueAt,
      completed: item.status === "completed",
    })),
  };
}
