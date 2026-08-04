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

export type ActionItemInsight = {
  id: string;
  task: string;
  owner: string | null;
  dueAt: string | null;
  completed: boolean;
};

export type DecisionInsight = {
  id: string;
  text: string;
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
  schemaVersion: 1;
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

