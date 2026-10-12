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

/** Early, partial result shown while a job is still processing. */
export type ProcessingPreview = {
  transcript: string;
  title?: string;
  summary?: string;
};

export type ProcessingJobState =
  | { status: "queued"; jobId: string }
  | { status: "processing"; jobId: string; progress: number; preview?: ProcessingPreview }
  | { status: "complete"; jobId: string; result: ProcessedConversation }
  | { status: "failed"; jobId: string; error: string };

export type AskHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AskRequest = {
  question: string;
  context: Array<{ id: string; text: string }>;
  history?: AskHistoryMessage[] | undefined;
};

export type AskResponse = {
  answer: string;
  citations: string[];
};

export type GoogleConnectionStatus = {
  connected: boolean;
  email: string | null;
  /** "expired" means Google revoked the refresh token; reconnect to continue. */
  status: "active" | "expired" | "revoked" | "disconnected";
};

export type GoogleTranscriptStatus =
  | "upcoming"
  | "available"
  | "processing"
  | "expired"
  | "none";

export type GoogleAttendeeResponse = "accepted" | "declined" | "tentative" | "needsAction";

export type GoogleMeetingAttendee = {
  name: string | null;
  email: string | null;
  self: boolean;
  organizer: boolean;
  response: GoogleAttendeeResponse;
};

export type GoogleMeeting = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  meetCode: string | null;
  htmlLink: string | null;
  /** Plain-text event description (HTML stripped, trimmed). */
  description: string | null;
  location: string | null;
  organizer: { name: string | null; email: string | null; self: boolean } | null;
  attendees: GoogleMeetingAttendee[];
  transcriptStatus: GoogleTranscriptStatus;
  /** Google Docs copy of the transcript, when Meet saved one. */
  docUrl: string | null;
};
