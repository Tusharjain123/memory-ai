import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type {
  EmbeddingInsight,
  ProcessedConversation,
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

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  async understand(transcript: DeepgramResult): Promise<Understanding> {
    const speakerTranscript = transcript.utterances
      .map(
        (item) =>
          `[${item.startMs}-${item.endMs}] Speaker ${item.speaker + 1}: ${item.text}`,
      )
      .join("\n");
    const response = await ollamaFetch("chat", "/api/chat", {
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
              "Never invent names, owners, dates, decisions, tasks, or spoken words.",
              "cleanText / cleanTranscript: fix only obvious ASR typos, casing, and punctuation. Do not paraphrase, summarize, reorder, or add words.",
              "romanHinglishText / romanHinglishTranscript: romanize Hindi words faithfully into Latin script; keep English words as English; do not invent content.",
              "Produce one segments entry per input utterance, in the same order, keeping the same speakers and timing.",
              "Segment IDs and item IDs must be unique strings.",
              `Required JSON Schema: ${JSON.stringify(understandingJsonSchema)}`,
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Detected languages: ${transcript.language}`,
              "Keep cleaned and Hinglish text faithful to each utterance below.",
              "Transcript:",
              speakerTranscript || transcript.rawTranscript,
            ].join("\n"),
          },
        ],
    });
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
    understanding: Understanding,
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
    const understanding = await this.understand(transcript);
    const segments = authoritativeSegments(transcript, understanding);
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
    const faithfulUnderstanding = {
      ...understanding,
      topics: [...new Set(understanding.topics.map((topic) => topic.trim()).filter(Boolean))],
      participants,
      segments,
      cleanTranscript: segments.map((segment) => segment.cleanText).join("\n"),
      romanHinglishTranscript: segments
        .map((segment) => segment.romanHinglishText)
        .join("\n"),
      decisions: understanding.decisions
        .filter((decision) => decision.text.trim())
        .map((decision, index) => ({
          id: `decision-${index + 1}`,
          text: decision.text.trim(),
        })),
      actionItems: understanding.actionItems
        .filter((item) => item.task.trim())
        .map((item, index) => ({
          ...item,
          id: `action-${index + 1}`,
          task: item.task.trim(),
        })),
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
      schemaVersion: 1,
      ...faithfulUnderstanding,
      language: transcript.language,
      durationMs: transcript.durationMs,
      rawTranscript: transcript.rawTranscript,
      embeddings,
    };
  }
}
