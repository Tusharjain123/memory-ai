import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { FeedbackInput } from "./feedback.types.js";

@Injectable()
export class FeedbackService {
  async create(input: FeedbackInput): Promise<void> {
    const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
    const secret = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url || !secret) {
      throw new ServiceUnavailableException("Feedback storage is not configured");
    }

    const response = await fetch(`${url}/rest/v1/app_feedback`, {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        category: input.category,
        message: input.message,
        rating: input.rating ?? null,
        email: input.email || null,
        app_version: input.appVersion || null,
        platform: input.platform,
        platform_version: input.platformVersion || null,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Could not save feedback (${response.status})`);
    }
  }
}
