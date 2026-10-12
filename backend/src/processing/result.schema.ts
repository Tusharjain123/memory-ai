import { z } from "zod";

const confidenceSchema = z.enum(["low", "medium", "high"]);

const evidenceFields = {
  confidence: confidenceSchema,
  segmentId: z.string().nullable(),
  quote: z.string().nullable(),
};

/**
 * Small, fast LLM pass: summary, people, decisions, tasks and memories.
 * Transcript text is never echoed back here; Deepgram stays authoritative.
 */
export const insightsSchema = z.object({
  title: z.string().min(1),
  mainGoal: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  participants: z.array(
    z.object({ name: z.string(), speakerLabel: z.string() }),
  ),
  decisions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      ...evidenceFields,
    }),
  ),
  commitments: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      direction: z.enum(["i_owe", "they_owe", "mutual", "unclear"]),
      ownerName: z.string().nullable(),
      counterpartyName: z.string().nullable(),
      dueAt: z.string().nullable(),
      status: z.literal("proposed"),
      ...evidenceFields,
    }),
  ),
  memoryCandidates: z.array(
    z.object({
      id: z.string(),
      personName: z.string().nullable(),
      kind: z.enum(["preference", "fact", "follow_up", "topic"]),
      text: z.string(),
      memoryClass: z.enum(["transcript_fact", "ai_inference"]),
      ...evidenceFields,
    }),
  ),
});

export type Insights = z.infer<typeof insightsSchema>;

/** Per-segment clean / romanized text, produced in parallel batches. */
export const segmentPolishSchema = z.object({
  segments: z.array(z.object({
    id: z.string(),
    cleanText: z.string(),
    romanHinglishText: z.string(),
  })),
});

export type SegmentPolish = z.infer<typeof segmentPolishSchema>["segments"][number];

export const segmentPolishJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["segments"],
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "cleanText", "romanHinglishText"],
        properties: {
          id: { type: "string" },
          cleanText: { type: "string" },
          romanHinglishText: { type: "string" },
        },
      },
    },
  },
} as const;

const evidenceJsonProperties = {
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  segmentId: { type: ["string", "null"] },
  quote: { type: ["string", "null"] },
} as const;

export const insightsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "mainGoal",
    "summary",
    "topics",
    "participants",
    "decisions",
    "commitments",
    "memoryCandidates",
  ],
  properties: {
    title: { type: "string" },
    mainGoal: { type: "string" },
    summary: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    participants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "speakerLabel"],
        properties: {
          name: { type: "string" },
          speakerLabel: { type: "string" },
        },
      },
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "confidence", "segmentId", "quote"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          ...evidenceJsonProperties,
        },
      },
    },
    commitments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text",
          "direction",
          "ownerName",
          "counterpartyName",
          "dueAt",
          "status",
          "confidence",
          "segmentId",
          "quote",
        ],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          direction: {
            type: "string",
            enum: ["i_owe", "they_owe", "mutual", "unclear"],
          },
          ownerName: { type: ["string", "null"] },
          counterpartyName: { type: ["string", "null"] },
          dueAt: { type: ["string", "null"] },
          status: { const: "proposed" },
          ...evidenceJsonProperties,
        },
      },
    },
    memoryCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "personName",
          "kind",
          "text",
          "memoryClass",
          "confidence",
          "segmentId",
          "quote",
        ],
        properties: {
          id: { type: "string" },
          personName: { type: ["string", "null"] },
          kind: {
            type: "string",
            enum: ["preference", "fact", "follow_up", "topic"],
          },
          text: { type: "string" },
          memoryClass: {
            type: "string",
            enum: ["transcript_fact", "ai_inference"],
          },
          ...evidenceJsonProperties,
        },
      },
    },
  },
} as const;
