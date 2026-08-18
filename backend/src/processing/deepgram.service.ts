import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { splitAudioIntoChunks } from "./audio-chunk.js";
import {
  computeDeepgramTimeoutMs,
  chunkConcurrency,
  probeAudio,
} from "./audio-probe.js";
import {
  assertWithinDurationLimit,
} from "./audio-limits.js";
import {
  isWeakTranscript,
  maybeNormalizeQuietAudio,
  type NormalizedAudio,
} from "./audio-normalize.js";
import {
  rebuildUtterancesFromWords,
  type DeepgramWord,
} from "./diarization.js";

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

export type TranscribeOptions = {
  keyterms?: string[];
  durationSec?: number;
  onProgress?: (completed: number, total: number) => void | Promise<void>;
  onPrepProgress?: (percent: number) => void | Promise<void>;
};

const DEEPGRAM_RETRY_ATTEMPTS = 3;

export function isRetryableDeepgramError(status: number, body = ""): boolean {
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  return /SLOW_UPLOAD|Request upload timeout/i.test(body);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DeepgramConfig = {
  model: string;
  language: string;
};

export type DeepgramPayload = {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{
        transcript?: string;
        languages?: string[];
        words?: DeepgramWord[];
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

type ChunkPayload = {
  payload: DeepgramPayload;
  offsetSec: number;
};

@Injectable()
export class DeepgramService {
  private readonly logger = new Logger(DeepgramService.name);

  async transcribe(
    audioPath: string,
    mimetype: string,
    options: TranscribeOptions = {},
  ): Promise<DeepgramResult> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException("Transcription is not configured");
    }

    const initialProbe = await probeAudio(audioPath);
    await options.onPrepProgress?.(18);
    const directory = dirname(audioPath);
    const normalized = await maybeNormalizeQuietAudio(
      audioPath,
      mimetype,
      directory,
      initialProbe,
    );
    if (normalized.boosted) {
      this.logger.log("Applied quiet-audio gain before Deepgram");
    }
    await options.onPrepProgress?.(20);

    const durationSec =
      normalized.probe.durationSec
      || initialProbe.durationSec
      || options.durationSec
      || 0;
    const durationMs = Math.round(durationSec * 1000);
    if (durationSec > 0) {
      try {
        assertWithinDurationLimit(durationSec);
      } catch (error) {
        throw new ServiceUnavailableException(
          error instanceof Error ? error.message : "Recording exceeds duration limit",
        );
      }
    }
    const config = resolveDeepgramConfig();
    const keyterms = options.keyterms ?? [];

    let primary: DeepgramResult;
    try {
      const chunks = await splitAudioIntoChunks(
        normalized.path,
        directory,
        normalized.probe,
        durationSec,
        async (completed, total) => {
          await options.onPrepProgress?.(20 + Math.round((completed / Math.max(1, total)) * 5));
        },
      );
      await options.onPrepProgress?.(25);
      if (chunks.length > 1) {
        this.logger.log(
          `Transcribing ${chunks.length} chunks (${Math.round(durationSec / 60)}m audio)`,
        );
      }
      const chunkPayloads = await this.transcribeChunks(
        apiKey,
        chunks,
        normalized.mimetype,
        config.language,
        config.model,
        keyterms,
        options.onProgress,
      );
      primary = chunkPayloads.length > 1
        ? mergeChunkPayloads(chunkPayloads, config.language, durationMs)
        : mapDeepgramPayload(chunkPayloads[0]!.payload, config.language);
    } catch (error) {
      throw wrapStageError("Transcription", error, durationSec);
    }

    if (
      config.language === "multi"
      && isWeakTranscript(primary.rawTranscript, primary.durationMs || durationMs)
    ) {
      this.logger.warn("Primary multilingual transcript looked weak; retrying with language=hi");
      try {
        const hindi = await this.transcribeWithLanguage(
          apiKey,
          normalized,
          directory,
          "hi",
          config.model,
          keyterms,
          durationSec,
          durationMs,
        );
        const winner = pickBetterTranscript(primary, hindi);
        this.logger.log(
          `Chose ${winner === hindi ? "hi" : "multi"} Deepgram pass (${winner.rawTranscript.length} chars, ${winner.utterances.length} turns)`,
        );
        return winner;
      } catch (error) {
        throw wrapStageError("Transcription (Hindi retry)", error, durationSec);
      }
    }

    return primary;
  }

  private async transcribeWithLanguage(
    apiKey: string,
    normalized: NormalizedAudio,
    directory: string,
    language: string,
    model: string,
    keyterms: string[],
    durationSec: number,
    durationMs: number,
  ): Promise<DeepgramResult> {
    const chunks = await splitAudioIntoChunks(
      normalized.path,
      directory,
      normalized.probe,
      durationSec,
    );
    const chunkPayloads = await this.transcribeChunks(
      apiKey,
      chunks,
      normalized.mimetype,
      language,
      model,
      keyterms,
    );
    return chunkPayloads.length > 1
      ? mergeChunkPayloads(chunkPayloads, language, durationMs)
      : mapDeepgramPayload(chunkPayloads[0]!.payload, language);
  }

  private async fetchPayload(
    apiKey: string,
    audioPath: string,
    mimetype: string,
    language: string,
    model: string,
    keyterms: string[],
    durationSec: number,
  ): Promise<DeepgramPayload> {
    const audio = await readFile(audioPath);
    const url = buildListenUrl({ model, language }, keyterms);
    const timeoutMs = computeDeepgramTimeoutMs(durationSec);
    let lastFailure: Error | undefined;

    for (let attempt = 0; attempt < DEEPGRAM_RETRY_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": mimetype,
            "Content-Length": String(audio.byteLength),
          },
          body: audio,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          lastFailure = new ServiceUnavailableException(
            `Transcription timed out after ${Math.round(timeoutMs / 1000)}s (${Math.round(durationSec / 60)}m audio)`,
          );
          if (attempt < DEEPGRAM_RETRY_ATTEMPTS - 1) {
            await sleep(500 * 2 ** attempt);
            continue;
          }
          throw lastFailure;
        }
        throw error;
      }

      if (response.ok) {
        return (await response.json()) as DeepgramPayload;
      }
      const detail = (await response.text()).trim().slice(0, 300);
      lastFailure = new ServiceUnavailableException(
        detail
          ? `Transcription failed (${response.status}): ${detail}`
          : `Transcription failed (${response.status})`,
      );
      if (attempt < DEEPGRAM_RETRY_ATTEMPTS - 1 && isRetryableDeepgramError(response.status, detail)) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw lastFailure;
    }

    throw lastFailure ?? new ServiceUnavailableException("Transcription failed");
  }

  private async transcribeChunks(
    apiKey: string,
    chunks: Array<{ path: string; offsetSec: number; durationSec: number }>,
    mimetype: string,
    language: string,
    model: string,
    keyterms: string[],
    onProgress?: (completed: number, total: number) => void | Promise<void>,
  ): Promise<ChunkPayload[]> {
    const results: ChunkPayload[] = new Array(chunks.length);
    let completed = 0;
    const total = chunks.length;
    let nextIndex = 0;
    const workers = Math.min(chunkConcurrency(), total);

    const runWorker = async () => {
      while (nextIndex < total) {
        const index = nextIndex;
        nextIndex += 1;
        const chunk = chunks[index]!;
        const payload = await this.fetchPayload(
          apiKey,
          chunk.path,
          mimetype,
          language,
          model,
          keyterms,
          chunk.durationSec,
        );
        results[index] = { payload, offsetSec: chunk.offsetSec };
        completed += 1;
        await onProgress?.(completed, total);
      }
    };

    await Promise.all(Array.from({ length: workers }, () => runWorker()));
    return results;
  }
}

export function buildListenUrl(
  config: DeepgramConfig,
  keyterms: string[] = [],
): URL {
  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", config.model);
  url.searchParams.set("language", config.language);
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("diarize_model", "v2");
  url.searchParams.set("utterances", "true");
  for (const term of keyterms) {
    const clean = term.trim();
    if (clean) url.searchParams.append("keyterm", clean);
  }
  return url;
}

export function mergeChunkPayloads(
  chunks: ChunkPayload[],
  fallbackLanguage: string,
  totalDurationMs: number,
): DeepgramResult {
  const mergedWords: DeepgramWord[] = [];
  const languages = new Set<string>();

  for (const chunk of chunks) {
    const channel = chunk.payload.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];
    for (const code of alternative?.languages ?? []) {
      if (code.trim()) languages.add(code.trim());
    }
    for (const word of alternative?.words ?? []) {
      mergedWords.push({
        ...word,
        start: (word.start ?? 0) + chunk.offsetSec,
        end: (word.end ?? 0) + chunk.offsetSec,
      });
    }
  }

  const utterances = rebuildUtterancesFromWords(mergedWords);
  const rawTranscript = utterances.map((item) => item.text).join(" ").trim();
  const language = languages.size
    ? [...languages].join("+")
    : fallbackLanguage;

  return {
    rawTranscript,
    language,
    durationMs: totalDurationMs,
    utterances,
  };
}

export function mapDeepgramPayload(
  payload: DeepgramPayload,
  fallbackLanguage: string,
): DeepgramResult {
  const channel = payload.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  const words = alternative?.words ?? [];
  const fromWords = rebuildUtterancesFromWords(words);
  const fromUtterances = (payload.results?.utterances ?? []).map((item) => ({
    speaker: item.speaker ?? 0,
    startMs: Math.round((item.start ?? 0) * 1000),
    endMs: Math.round((item.end ?? 0) * 1000),
    text: item.transcript ?? "",
  }));
  const utterances = fromWords.length ? fromWords : fromUtterances;
  const rawTranscript =
    alternative?.transcript?.trim()
    || utterances.map((item) => item.text).join(" ").trim();

  return {
    rawTranscript,
    language: resolveDetectedLanguage(channel, alternative, fallbackLanguage),
    durationMs: Math.round((payload.metadata?.duration ?? 0) * 1000),
    utterances,
  };
}

export function pickBetterTranscript(
  primary: DeepgramResult,
  secondary: DeepgramResult,
): DeepgramResult {
  const primaryScore =
    primary.rawTranscript.replace(/\s+/g, "").length
    + primary.utterances.length * 8;
  const secondaryScore =
    secondary.rawTranscript.replace(/\s+/g, "").length
    + secondary.utterances.length * 8;
  return secondaryScore > primaryScore ? secondary : primary;
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

function wrapStageError(
  stage: string,
  error: unknown,
  durationSec: number,
): ServiceUnavailableException {
  const detail = error instanceof Error ? error.message : "unknown error";
  if (error instanceof ServiceUnavailableException) return error;
  return new ServiceUnavailableException(
    `${stage} failed (${Math.round(durationSec / 60)}m audio): ${detail}`,
  );
}
