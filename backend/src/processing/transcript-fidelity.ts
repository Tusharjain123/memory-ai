import type { TranscriptSegment } from "../contracts";
import type { DeepgramResult } from "./deepgram.service.js";
import type { Understanding } from "./result.schema.js";

export function authoritativeSegments(
  transcript: DeepgramResult,
  understanding: Understanding,
): TranscriptSegment[] {
  const source = transcript.utterances.length
    ? transcript.utterances
    : transcript.rawTranscript
      ? [{
          speaker: 0,
          startMs: 0,
          endMs: transcript.durationMs,
          text: transcript.rawTranscript,
        }]
      : [];

  return source.map((utterance, index) => {
    const enriched = understanding.segments[index];
    return {
      id: `segment-${index + 1}`,
      speakerLabel: `Speaker ${utterance.speaker + 1}`,
      startMs: utterance.startMs,
      endMs: utterance.endMs,
      rawText: utterance.text,
      cleanText: enriched?.cleanText.trim() || utterance.text,
      romanHinglishText: enriched?.romanHinglishText.trim() || utterance.text,
    };
  });
}
