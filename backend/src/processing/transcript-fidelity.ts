import type { TranscriptSegment } from "../contracts";
import type { DeepgramResult } from "./deepgram.service.js";
import type { SegmentPolish } from "./result.schema.js";
import { speakerLabel } from "./speaker-label.js";

export function authoritativeSegments(
  transcript: DeepgramResult,
  polished: SegmentPolish[] = [],
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
  const polishById = new Map(polished.map((item) => [item.id.trim(), item]));

  return source.map((utterance, index) => {
    const id = `segment-${index + 1}`;
    const enriched = polishById.get(id);
    return {
      id,
      speakerLabel: speakerLabel(utterance.speaker, transcript.speakerNames),
      startMs: utterance.startMs,
      endMs: utterance.endMs,
      rawText: utterance.text,
      cleanText: enriched?.cleanText.trim() || utterance.text,
      romanHinglishText: enriched?.romanHinglishText.trim() || utterance.text,
    };
  });
}
