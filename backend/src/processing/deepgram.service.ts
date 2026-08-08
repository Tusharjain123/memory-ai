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

type DeepgramConfig = {
  model: string;
  language: string;
};

@Injectable()
export class DeepgramService {
  async transcribe(audioPath: string, mimetype: string): Promise<DeepgramResult> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException("Transcription is not configured");
    }
    const audio = await readFile(audioPath);
    const config = resolveDeepgramConfig();
    const url = new URL("https://api.deepgram.com/v1/listen");
    url.searchParams.set("model", config.model);
    url.searchParams.set("language", config.language);
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");
    // diarize_model enables diarization; do not also set diarize=true (Deepgram rejects both).
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
      const detail = (await response.text()).trim().slice(0, 300);
      throw new ServiceUnavailableException(
        detail
          ? `Transcription failed (${response.status}): ${detail}`
          : `Transcription failed (${response.status})`,
      );
    }
    const payload = (await response.json()) as {
      metadata?: { duration?: number };
      results?: {
        channels?: Array<{
          detected_language?: string;
          alternatives?: Array<{
            transcript?: string;
            languages?: string[];
          }>;
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
    const alternative = channel?.alternatives?.[0];
    return {
      rawTranscript: alternative?.transcript ?? "",
      language: resolveDetectedLanguage(channel, alternative, config.language),
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

export function resolveDeepgramConfig(): DeepgramConfig {
  const model = process.env.DEEPGRAM_MODEL?.trim() || "nova-3";
  const language = process.env.DEEPGRAM_LANGUAGE?.trim() || "multi";
  return { model, language };
}

export function resolveDetectedLanguage(
  channel:
    | {
        detected_language?: string;
      }
    | undefined,
  alternative:
    | {
        languages?: string[];
      }
    | undefined,
  fallback: string,
): string {
  const languages = (alternative?.languages ?? [])
    .map((code) => code.trim())
    .filter(Boolean);
  if (languages.length) {
    return [...new Set(languages)].join("+");
  }
  const detected = channel?.detected_language?.trim();
  if (detected) return detected;
  return fallback;
}
