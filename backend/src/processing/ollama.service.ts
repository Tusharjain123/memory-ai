import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type {
  CommitmentInsight,
  DecisionInsight,
  EmbeddingInsight,
  MemoryCandidateInsight,
  ProcessedConversation,
  TranscriptSegment,
} from "../contracts";
import type { DeepgramResult } from "./deepgram.service.js";
import {
  insightsJsonSchema,
  insightsSchema,
  segmentPolishJsonSchema,
  segmentPolishSchema,
  type Insights,
  type SegmentPolish,
} from "./result.schema.js";
import { authoritativeSegments } from "./transcript-fidelity.js";
import {
  ollamaFetch,
  ollamaStructuredFormat,
} from "../ollama/ollama-client.js";
import { isRetryableChatStatus, parseStructuredChatJson, readChatMessage, type JsonSchema } from "../ollama/parse-model-json.js";
import { createOpenAiEmbeddings } from "../embeddings/openai-embeddings.js";
import { computeOllamaChatTimeoutMs } from "./audio-probe.js";
import {
  describeFetchError,
  isDeadlineError,
  isRetryableNetworkError,
} from "./fetch-with-timeout.js";
import {
  isLongTranscript,
  prepareUnderstandingUtterances,
  segmentsFromRawUtterances,
} from "./transcript-coarsen.js";
import {
  attachEvidence,
  buildSegmentLookup,
  formatUtteranceForUnderstanding,
} from "./evidence-attach.js";

const OLLAMA_NETWORK_RETRY_ATTEMPTS = 3;
const STRUCTURED_OUTPUT_ATTEMPTS = 2;
const POLISH_BATCH_SIZE = 40;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapUnderstandingError(error: unknown): ServiceUnavailableException {
  if (error instanceof ServiceUnavailableException) return error;
  return new ServiceUnavailableException(
    `Understanding failed: ${describeFetchError(error)}`,
  );
}

export function polishConcurrency(): number {
  const parsed = Number(process.env.OLLAMA_POLISH_CONCURRENCY);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 8) : 4;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => runWorker()),
  );
  return results;
}

export type AssembleStage =
  | { stage: "insights"; title: string; summary: string }
  | { stage: "polished" };

export type AssembleOptions = {
  onStage?: (event: AssembleStage) => void | Promise<void>;
};

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  /** Summary, people, decisions, commitments and memories — no transcript echo. */
  async understand(
    transcript: DeepgramResult,
    durationSec?: number,
    options: { longRecording?: boolean } = {},
  ): Promise<Insights> {
    const longRecording = options.longRecording ?? false;
    const speakerTranscript = transcript.utterances
      .map((item, index) => formatUtteranceForUnderstanding(item, index, transcript.speakerNames))
      .join("\n");
    const timeoutMs = computeOllamaChatTimeoutMs(
      durationSec ?? transcript.durationMs / 1000,
    );
    const body = {
      model: process.env.OLLAMA_CHAT_MODEL ?? "qwen3",
      stream: false,
      think: false,
      format: ollamaStructuredFormat(insightsJsonSchema),
      messages: [
        {
          role: "system",
          content: [
            "Return valid JSON only, with no prose or markdown.",
            "Extract faithful structured meeting memory from the transcript utterances.",
            "Preserve Hindi-English code switching and speaker meaning exactly.",
            "Never invent names, owners, dates, decisions, commitments, facts, or spoken words.",
            "Do not repeat or rewrite the transcript; only return the fields in the schema.",
            "Segment IDs and item IDs must be unique strings.",
            "commitments: extract explicit promises between people (what someone said they would do). Prefer spoken promises over generic todos.",
            "direction: i_owe if the user/self speaker promised; they_owe if another person promised; mutual if both; unclear otherwise.",
            "For commitments, decisions, and memoryCandidates: quote must be an exact or near-exact excerpt from a segment; segmentId must be that segment's segment-N id; leave dueAt null when no date was stated; set confidence low/medium/high.",
            "memoryCandidates: durable preferences, facts, follow-ups, or recurring topics worth remembering about a person.",
            "Do not invent evidence. If unsure of the supporting utterance, set segmentId and quote to null and confidence to low.",
            `Required JSON Schema: ${JSON.stringify(insightsJsonSchema)}`,
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Detected languages: ${transcript.language}`,
            transcript.speakerNames?.length
              ? "Speaker names come from the meeting platform and are exact. Use them verbatim as participant names and speakerLabel values."
              : null,
            transcript.speakerHints?.length
              ? `Likely participants from the calendar invite (not all may have spoken): ${transcript.speakerHints.join(", ")}. Map a name to a speaker label only when the utterances support it.`
              : null,
            longRecording
              ? "This is a long recording. Work from the sampled utterances below; do not invent missing sections."
              : null,
            longRecording && transcript.rawTranscript.length > 8_000
              ? `Transcript excerpt:\n${transcript.rawTranscript.slice(0, 8_000)}`
              : null,
            "Utterances:",
            speakerTranscript || transcript.rawTranscript,
          ].filter(Boolean).join("\n"),
        },
      ],
    };
    return this.structuredChat(body, insightsSchema, timeoutMs, transcript.rawTranscript.length);
  }

  /**
   * Clean + romanized text per utterance, in parallel batches. A failed batch
   * keeps raw Deepgram text for its segments instead of failing the memory.
   */
  async polishSegments(
    utterances: DeepgramResult["utterances"],
    language: string,
    speakerNames?: readonly string[],
  ): Promise<SegmentPolish[]> {
    const indexed = utterances.map((utterance, index) => ({ utterance, index }));
    const batches: Array<typeof indexed> = [];
    for (let start = 0; start < indexed.length; start += POLISH_BATCH_SIZE) {
      batches.push(indexed.slice(start, start + POLISH_BATCH_SIZE));
    }
    const results = await mapWithConcurrency(batches, polishConcurrency(), async (batch) => {
      const lines = batch.map(({ utterance, index }) =>
        formatUtteranceForUnderstanding(utterance, index, speakerNames));
      const batchDurationSec = Math.max(
        0,
        (batch[batch.length - 1]!.utterance.endMs - batch[0]!.utterance.startMs) / 1000,
      );
      const body = {
        model: process.env.OLLAMA_CHAT_MODEL ?? "qwen3",
        stream: false,
        think: false,
        format: ollamaStructuredFormat(segmentPolishJsonSchema),
        messages: [
          {
            role: "system",
            content: [
              "Return valid JSON only, with no prose or markdown.",
              "For each input utterance return one segments entry with the same segment-N id, in the same order.",
              "cleanText: fix only obvious ASR typos, casing, and punctuation. Do not paraphrase, summarize, reorder, or add words.",
              "romanHinglishText: romanize Hindi words faithfully into Latin script; keep English words as English; do not invent content.",
              `Required JSON Schema: ${JSON.stringify(segmentPolishJsonSchema)}`,
            ].join("\n"),
          },
          {
            role: "user",
            content: [`Detected languages: ${language}`, "Utterances:", ...lines].join("\n"),
          },
        ],
      };
      try {
        const polished = await this.structuredChat(
          body,
          segmentPolishSchema,
          computeOllamaChatTimeoutMs(batchDurationSec),
          lines.join("\n").length,
        );
        return polished.segments;
      } catch (error) {
        this.logger.warn(
          `Transcript polish batch kept raw text: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
        return [];
      }
    });
    return results.flat();
  }

  private async structuredChat<T>(
    body: unknown,
    schema: JsonSchema<T>,
    timeoutMs: number,
    transcriptChars: number,
  ): Promise<T> {
    let lastError = "Understanding returned invalid structured content";
    for (let attempt = 0; attempt < STRUCTURED_OUTPUT_ATTEMPTS; attempt += 1) {
      const response = await this.chatWithRetry(body, timeoutMs, transcriptChars);
      if (!response.ok) {
        throw new ServiceUnavailableException(`Understanding failed (${response.status})`);
      }
      const message = await readChatMessage(response);
      if (!message) {
        lastError = "Understanding returned invalid structured content";
      } else if (!message.content?.trim() && !message.thinking?.trim()) {
        lastError = "Understanding returned no content";
      } else {
        try {
          return parseStructuredChatJson(message, schema);
        } catch (error) {
          if (error instanceof ServiceUnavailableException) throw error;
          lastError = "Understanding returned invalid structured content";
        }
      }
      if (attempt < STRUCTURED_OUTPUT_ATTEMPTS - 1) {
        this.logger.warn(`Understanding output retry ${attempt + 1}/${STRUCTURED_OUTPUT_ATTEMPTS - 1}: ${lastError}`);
        continue;
      }
    }
    throw new ServiceUnavailableException(lastError);
  }

  private async chatWithRetry(
    body: unknown,
    timeoutMs: number,
    transcriptChars: number,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < OLLAMA_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await ollamaFetch("chat", "/api/chat", body, timeoutMs);
        if (response.ok || !isRetryableChatStatus(response.status) || attempt === OLLAMA_NETWORK_RETRY_ATTEMPTS - 1) {
          return response;
        }
        await response.text().catch(() => undefined);
        this.logger.warn(
          `Understanding HTTP retry ${attempt + 1}/${OLLAMA_NETWORK_RETRY_ATTEMPTS - 1}: status ${response.status}`,
        );
        await sleep(500 * 2 ** attempt);
        continue;
      } catch (error) {
        lastError = error;
        if (isDeadlineError(error)) {
          throw new ServiceUnavailableException(
            `Understanding timed out after ${Math.round(timeoutMs / 1000)}s (${transcriptChars} chars)`,
          );
        }
        if (attempt < OLLAMA_NETWORK_RETRY_ATTEMPTS - 1 && isRetryableNetworkError(error)) {
          this.logger.warn(
            `Understanding fetch retry ${attempt + 1}/${OLLAMA_NETWORK_RETRY_ATTEMPTS - 1}: ${describeFetchError(error)}`,
          );
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw wrapUnderstandingError(error);
      }
    }
    throw wrapUnderstandingError(lastError);
  }

  async embed(
    understanding: Pick<Insights, "title" | "summary" | "topics"> & {
      segments: Array<{ id: string; cleanText: string }>;
    },
  ): Promise<EmbeddingInsight[]> {
    const sources = [
      {
        sourceType: "conversation" as const,
        sourceId: "conversation",
        text: `${understanding.title}\n${understanding.summary}\n${understanding.topics.join(", ")}`,
      },
      ...understanding.segments.map((segment) => ({
        sourceType: "segment" as const,
        sourceId: segment.id,
        text: segment.cleanText,
      })),
    ].filter((source) => source.text.trim());
    const { model, vectors } = await createOpenAiEmbeddings(
      sources.map((source) => source.text),
    );
    return sources.map((source, index) => ({
      ...source,
      model,
      vector: vectors[index] ?? [],
    }));
  }

  async assemble(
    transcript: DeepgramResult,
    options: AssembleOptions = {},
  ): Promise<ProcessedConversation> {
    const durationSec = transcript.durationMs / 1000;
    const longTranscript = isLongTranscript(transcript);
    const understandingInput = longTranscript
      ? {
          ...transcript,
          utterances: prepareUnderstandingUtterances(transcript),
        }
      : transcript;
    // Insights and transcript polish are independent LLM passes; run them together.
    const [understanding, polished] = await Promise.all([
      this.understand(
        understandingInput,
        durationSec,
        { longRecording: longTranscript },
      ).then(async (insights) => {
        await options.onStage?.({
          stage: "insights",
          title: insights.title,
          summary: insights.summary,
        });
        return insights;
      }),
      (longTranscript
        ? Promise.resolve([] as SegmentPolish[])
        : this.polishSegments(transcript.utterances, transcript.language, transcript.speakerNames)
      ).then(async (items) => {
        await options.onStage?.({ stage: "polished" });
        return items;
      }),
    ]);
    const segments = longTranscript
      ? segmentsFromRawUtterances(transcript.utterances, transcript.speakerNames)
      : authoritativeSegments(transcript, polished);
    const segmentsById = buildSegmentLookup(segments);
    // Names known from the source (Meet) always appear, even if the model skipped them.
    const knownSpeakers = (transcript.speakerNames ?? [])
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, speakerLabel: name }));
    const participants = [
      ...new Map(
        [...understanding.participants, ...knownSpeakers]
          .filter((participant) => participant.name.trim())
          .map((participant) => [
            participant.name.trim().toLocaleLowerCase(),
            { ...participant, name: participant.name.trim() },
          ]),
      ).values(),
    ];
    const decisions: DecisionInsight[] = understanding.decisions
      .filter((decision) => decision.text.trim())
      .map((decision, index) => {
        const withEvidence = attachEvidence(decision, segmentsById, segments);
        return {
          id: `decision-${index + 1}`,
          text: decision.text.trim(),
          confidence: decision.confidence,
          segmentId: withEvidence.segmentId,
          quote: withEvidence.quote,
          startMs: withEvidence.startMs,
          speakerLabel: withEvidence.speakerLabel,
        };
      });
    const commitments: CommitmentInsight[] = understanding.commitments
      .filter((item) => item.text.trim())
      .map((item, index) => {
        const withEvidence = attachEvidence(item, segmentsById, segments);
        return {
          id: `commitment-${index + 1}`,
          text: item.text.trim(),
          direction: item.direction,
          ownerName: item.ownerName?.trim() || null,
          counterpartyName: item.counterpartyName?.trim() || null,
          dueAt: item.dueAt?.trim() || null,
          confidence: item.confidence,
          status: "proposed",
          segmentId: withEvidence.segmentId,
          quote: withEvidence.quote,
          startMs: withEvidence.startMs,
          speakerLabel: withEvidence.speakerLabel,
        };
      });
    const memoryCandidates: MemoryCandidateInsight[] = understanding.memoryCandidates
      .filter((item) => item.text.trim())
      .map((item, index) => {
        const withEvidence = attachEvidence(item, segmentsById, segments);
        return {
          id: `memory-${index + 1}`,
          personName: item.personName?.trim() || null,
          kind: item.kind,
          text: item.text.trim(),
          memoryClass: item.memoryClass,
          confidence: item.confidence,
          segmentId: withEvidence.segmentId,
          quote: withEvidence.quote,
          startMs: withEvidence.startMs,
          speakerLabel: withEvidence.speakerLabel,
        };
      });
    const faithfulUnderstanding = {
      ...understanding,
      topics: [...new Set(understanding.topics.map((topic) => topic.trim()).filter(Boolean))],
      participants,
      segments,
      cleanTranscript: segments.map((segment) => segment.cleanText).join("\n"),
      romanHinglishTranscript: segments
        .map((segment) => segment.romanHinglishText)
        .join("\n"),
      decisions,
      commitments,
      memoryCandidates,
    };
    let embeddings: EmbeddingInsight[] = [];
    try {
      embeddings = await this.embed(faithfulUnderstanding);
    } catch (error) {
      this.logger.warn(
        `Memory created without semantic embeddings: ${
          error instanceof Error ? error.message : "unknown embedding error"
        }`,
      );
    }
    return {
      schemaVersion: 2,
      ...faithfulUnderstanding,
      language: transcript.language,
      durationMs: transcript.durationMs,
      rawTranscript: transcript.rawTranscript,
      actionItems: commitments.map((item) => ({
        id: item.id,
        task: item.text,
        owner: item.ownerName,
        dueAt: item.dueAt,
        completed: false,
      })),
      embeddings,
    };
  }
}
