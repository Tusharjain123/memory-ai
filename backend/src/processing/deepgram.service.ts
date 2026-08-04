import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { readFile } from "node:fs/promises";

export type DeepgramResult = {
  rawTranscript: string;
  language: string;
  durationMs: number;
  utterances: Array<{
    speaker: number;
    startMs: number;
    endMs: number;
    text: string;
  }>;
};

@Injectable()
export class DeepgramService {
  async transcribe(audioPath: string, mimetype: string): Promise<DeepgramResult> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException("Transcription is not configured");
    }
    const audio = await readFile(audioPath);
    const url = new URL("https://api.deepgram.com/v1/listen");
    url.searchParams.set("model", "nova-3");
    url.searchParams.set("language", "multi");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("diarize_model", "latest");
    url.searchParams.set("utterances", "true");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimetype,
      },
      body: audio,
      signal: AbortSignal.timeout(this.timeoutMs()),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`Transcription failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      metadata?: { duration?: number };
      results?: {
        channels?: Array<{
          detected_language?: string;
          alternatives?: Array<{ transcript?: string }>;
        }>;
        utterances?: Array<{
          speaker?: number;
          start?: number;
          end?: number;
          transcript?: string;
        }>;
      };
    };
    const channel = payload.results?.channels?.[0];
    return {
      rawTranscript: channel?.alternatives?.[0]?.transcript ?? "",
      language: channel?.detected_language ?? "multi",
      durationMs: Math.round((payload.metadata?.duration ?? 0) * 1000),
      utterances: (payload.results?.utterances ?? []).map((item) => ({
        speaker: item.speaker ?? 0,
        startMs: Math.round((item.start ?? 0) * 1000),
        endMs: Math.round((item.end ?? 0) * 1000),
        text: item.transcript ?? "",
      })),
    };
  }

  private timeoutMs(): number {
    const configured = Number(process.env.DEEPGRAM_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : 300_000;
  }
}
