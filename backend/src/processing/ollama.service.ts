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
  understandingSchema,
  understandingJsonSchema,
  type Understanding,
} from "./result.schema.js";
import { authoritativeSegments } from "./transcript-fidelity.js";
import {
  ollamaFetch,
  ollamaStructuredFormat,
} from "../ollama/ollama-client.js";
import { createOpenAiEmbeddings } from "../embeddings/openai-embeddings.js";
import { computeOllamaChatTimeoutMs } from "./audio-probe.js";
import {
  isLongTranscript,
  prepareUnderstandingUtterances,
  segmentsFromRawUtterances,
} from "./transcript-coarsen.js";

type ClaimWithEvidence = {
  segmentId: string | null;
  quote: string | null;
};

function buildSegmentLookup(
  understanding: Understanding,
  authoritative: TranscriptSegment[],
): Map<string, TranscriptSegment> {
  const byId = new Map<string, TranscriptSegment>();
  for (const segment of authoritative) {
    byId.set(segment.id, segment);
  }
  understanding.segments.forEach((segment, index) => {
    const auth = authoritative[index];
    if (auth && segment.id) byId.set(segment.id, auth);
  });
  return byId;
}

function attachEvidence<T extends ClaimWithEvidence>(
  claim: T,
  segmentsById: Map<string, TranscriptSegment>,
): T & {
  startMs: number | null;
  speakerLabel: string | null;
  segmentId: string | null;
  quote: string | null;
} {
  const segment = claim.segmentId
    ? segmentsById.get(claim.segmentId)
    : undefined;
  if (!segment) {
    return {
      ...claim,
      segmentId: null,
      quote: claim.quote?.trim() || null,
      startMs: null,
      speakerLabel: null,
    };
  }
  return {
    ...claim,
    segmentId: segment.id,
    quote: claim.quote?.trim() || null,
    startMs: segment.startMs,
    speakerLabel: segment.speakerLabel,
  };
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  async understand(
    transcript: DeepgramResult,
    durationSec?: number,
    options: { longRecording?: boolean } = {},
  ): Promise<Understanding> {
    const longRecording = options.longRecording ?? false;
    const speakerTranscript = transcript.utterances
      .map(
        (item) =>
          `[${item.startMs}-${item.endMs}] Speaker ${item.speaker + 1}: ${item.text}`,
      )
      .join("\n");
    const timeoutMs = computeOllamaChatTimeoutMs(
      durationSec ?? transcript.durationMs / 1000,
    );
    let response: Response;
    try {
      response = await ollamaFetch("chat", "/api/chat", {
        model: process.env.OLLAMA_CHAT_MODEL ?? "qwen3",
        stream: false,
        think: false,
        format: ollamaStructuredFormat(understandingJsonSchema),
        messages: [
          {
            role: "system",
            content: [
              "Return valid JSON only, with no prose or markdown.",
              "Extract faithful structured meeting memory from the transcript utterances.",
              "Preserve Hindi-English code switching and speaker meaning exactly.",
              "Never invent names, owners, dates, decisions, commitments, facts, or spoken words.",
              "cleanText / cleanTranscript: fix only obvious ASR typos, casing, and punctuation. Do not paraphrase, summarize, reorder, or add words.",
              "romanHinglishText / romanHinglishTranscript: romanize Hindi words faithfully into Latin script; keep English words as English; do not invent content.",
              "Produce one segments entry per input utterance, in the same order, keeping the same speakers and timing.",
              "Segment IDs and item IDs must be unique strings.",
              "commitments: extract explicit promises between people (what someone said they would do). Prefer spoken promises over generic todos.",
              "direction: i_owe if the user/self speaker promised; they_owe if another person promised; mutual if both; unclear otherwise.",
              "For commitments, decisions, and memoryCandidates: quote must be an exact or near-exact excerpt from a segment; segmentId must match that segment; leave dueAt null when no date was stated; set confidence low/medium/high.",
              "memoryCandidates: durable preferences, facts, follow-ups, or recurring topics worth remembering about a person.",
              "Do not invent evidence. If unsure of the supporting utterance, set segmentId and quote to null and confidence to low.",
              `Required JSON Schema: ${JSON.stringify(understandingJsonSchema)}`,
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Detected languages: ${transcript.language}`,
              longRecording
                ? "This is a long recording. Work from the sampled utterances below; do not invent missing sections."
                : "Keep cleaned and Hinglish text faithful to each utterance below.",
              longRecording && transcript.rawTranscript.length > 8_000
                ? `Transcript excerpt:\n${transcript.rawTranscript.slice(0, 8_000)}`
                : null,
              "Utterances:",
              speakerTranscript || transcript.rawTranscript,
            ].filter(Boolean).join("\n"),
          },
        ],
      }, timeoutMs);
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ServiceUnavailableException(
          `Understanding timed out after ${Math.round(timeoutMs / 1000)}s (${transcript.rawTranscript.length} chars)`,
        );
      }
      throw error;
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`Understanding failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      message?: { content?: string };
    };
    const content = payload.message?.content;
    if (!content) {
      throw new ServiceUnavailableException("Understanding returned no content");
    }
    return understandingSchema.parse(JSON.parse(content));
  }

  async embed(
    understanding: Pick<Understanding, "title" | "summary" | "topics" | "segments">,
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

  async assemble(transcript: DeepgramResult): Promise<ProcessedConversation> {
    const durationSec = transcript.durationMs / 1000;
    const longTranscript = isLongTranscript(transcript);
    const understandingInput = longTranscript
      ? {
          ...transcript,
          utterances: prepareUnderstandingUtterances(transcript),
        }
      : transcript;
    const understanding = await this.understand(
      understandingInput,
      durationSec,
      { longRecording: longTranscript },
    );
    const segments = longTranscript
      ? segmentsFromRawUtterances(transcript.utterances)
      : authoritativeSegments(transcript, understanding);
    const segmentsById = buildSegmentLookup(understanding, segments);
    const participants = [
      ...new Map(
        understanding.participants
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
        const withEvidence = attachEvidence(decision, segmentsById);
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
        const withEvidence = attachEvidence(item, segmentsById);
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
        const withEvidence = attachEvidence(item, segmentsById);
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
