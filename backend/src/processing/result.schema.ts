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
  decisions: z.array(z.object({ id: z.string(), text: z.string() })),
  actionItems: z.array(
    z.object({
      id: z.string(),
      task: z.string(),
      owner: z.string().nullable(),
      dueAt: z.string().nullable(),
      completed: z.literal(false),
    }),
  ),
});

export type Understanding = z.infer<typeof understandingSchema>;

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
    "actionItems",
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
        required: ["id", "text"],
        properties: { id: { type: "string" }, text: { type: "string" } },
      },
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "task", "owner", "dueAt", "completed"],
        properties: {
          id: { type: "string" },
          task: { type: "string" },
          owner: { type: ["string", "null"] },
          dueAt: { type: ["string", "null"] },
          completed: { const: false },
        },
      },
    },
  },
} as const;
