import { z } from "zod";

const segmentSchema = z.object({
  id: z.string(),
  speakerLabel: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  rawText: z.string(),
  cleanText: z.string(),
  romanHinglishText: z.string(),
}).refine((segment) => segment.endMs >= segment.startMs, {
  message: "Segment end must not precede its start",
});

const confidenceSchema = z.enum(["low", "medium", "high"]);

const evidenceFields = {
  confidence: confidenceSchema,
  segmentId: z.string().nullable(),
  quote: z.string().nullable(),
};

export const understandingSchema = z.object({
  title: z.string().min(1),
  mainGoal: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  cleanTranscript: z.string(),
  romanHinglishTranscript: z.string(),
  participants: z.array(
    z.object({ name: z.string(), speakerLabel: z.string() }),
  ),
  segments: z.array(segmentSchema),
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

export type Understanding = z.infer<typeof understandingSchema>;

const evidenceJsonProperties = {
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  segmentId: { type: ["string", "null"] },
  quote: { type: ["string", "null"] },
} as const;

export const understandingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "mainGoal",
    "summary",
    "topics",
    "cleanTranscript",
    "romanHinglishTranscript",
    "participants",
    "segments",
    "decisions",
    "commitments",
    "memoryCandidates",
  ],
  properties: {
    title: { type: "string" },
    mainGoal: { type: "string" },
    summary: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    cleanTranscript: { type: "string" },
    romanHinglishTranscript: { type: "string" },
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
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "speakerLabel",
          "startMs",
          "endMs",
          "rawText",
          "cleanText",
          "romanHinglishText",
        ],
        properties: {
          id: { type: "string" },
          speakerLabel: { type: "string" },
          startMs: { type: "number", minimum: 0 },
          endMs: { type: "number", minimum: 0 },
          rawText: { type: "string" },
          cleanText: { type: "string" },
          romanHinglishText: { type: "string" },
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
