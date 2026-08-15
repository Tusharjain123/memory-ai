import { z } from "zod";

export const feedbackSchema = z.object({
  category: z.enum(["bug", "suggestion", "transcription", "experience", "other"]),
  message: z.string().trim().min(10).max(4_000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  appVersion: z.string().trim().max(50).nullable().optional(),
  platform: z.enum(["android", "ios", "web", "unknown"]).default("unknown"),
  platformVersion: z.string().trim().max(100).nullable().optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
