export type TranscriptSegment = {
  id: string;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  rawText: string;
  cleanText: string;
  romanHinglishText: string;
};

export type ParticipantInsight = {
  name: string;
  speakerLabel: string;
};

export type ConfidenceLevel = "low" | "medium" | "high";
export type CommitmentDirection = "i_owe" | "they_owe" | "mutual" | "unclear";
export type CommitmentStatus = "proposed" | "confirmed" | "completed" | "cancelled";
export type MemoryClass = "transcript_fact" | "ai_inference" | "user_confirmed";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "corrected" | "sensitive";
export type MemoryCandidateKind = "preference" | "fact" | "follow_up" | "topic";

export type CommitmentInsight = {
  id: string;
  text: string;
  direction: CommitmentDirection;
  ownerName: string | null;
  counterpartyName: string | null;
  dueAt: string | null;
  confidence: ConfidenceLevel;
  status: CommitmentStatus;
  segmentId: string | null;
  quote: string | null;
  startMs: number | null;
  speakerLabel: string | null;
};

export type DecisionInsight = {
  id: string;
  text: string;
  confidence: ConfidenceLevel;
  segmentId: string | null;
  quote: string | null;
  startMs: number | null;
  speakerLabel: string | null;
};

export type MemoryCandidateInsight = {
  id: string;
  personName: string | null;
  kind: MemoryCandidateKind;
  text: string;
  memoryClass: Exclude<MemoryClass, "user_confirmed">;
  confidence: ConfidenceLevel;
  segmentId: string | null;
  quote: string | null;
  startMs: number | null;
  speakerLabel: string | null;
};

/** @deprecated Prefer commitments. */
export type ActionItemInsight = {
  id: string;
  task: string;
  owner: string | null;
  dueAt: string | null;
  completed: boolean;
};

export type EmbeddingInsight = {
  model: string;
  sourceType: "conversation" | "segment";
  sourceId: string;
  vector: number[];
  text: string;
};

export type EmbeddingVectorResponse = {
  model: string;
  vector: number[];
};

export type ProcessedConversation = {
  schemaVersion: 1 | 2;
  title: string;
  mainGoal: string;
  summary: string;
  topics: string[];
  language: string;
  durationMs: number;
  rawTranscript: string;
  cleanTranscript: string;
  romanHinglishTranscript: string;
  participants: ParticipantInsight[];
  segments: TranscriptSegment[];
  decisions: DecisionInsight[];
  commitments?: CommitmentInsight[];
  memoryCandidates?: MemoryCandidateInsight[];
  actionItems: ActionItemInsight[];
  embeddings: EmbeddingInsight[];
};

export type ProcessingJobState =
  | { status: "queued"; jobId: string }
  | { status: "processing"; jobId: string; progress: number }
  | { status: "complete"; jobId: string; result: ProcessedConversation }
  | { status: "failed"; jobId: string; error: string };

export type AskRequest = {
  question: string;
  context: Array<{ id: string; text: string }>;
};

export type AskResponse = {
  answer: string;
  citations: string[];
};
