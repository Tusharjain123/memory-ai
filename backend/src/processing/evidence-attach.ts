import type { TranscriptSegment } from "../contracts.js";

export type ClaimWithEvidence = {
  segmentId: string | null;
  quote: string | null;
};

export function normalizeEvidenceText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function segmentContainsQuote(segment: TranscriptSegment, quote: string): boolean {
  const needle = normalizeEvidenceText(quote);
  if (!needle) return false;
  const haystacks = [
    segment.rawText,
    segment.cleanText,
    segment.romanHinglishText,
  ].map(normalizeEvidenceText);
  return haystacks.some((haystack) => haystack.includes(needle) || needle.includes(haystack));
}

export function findSegmentByQuote(
  segments: TranscriptSegment[],
  quote: string | null | undefined,
): TranscriptSegment | undefined {
  const trimmed = quote?.trim();
  if (!trimmed) return undefined;
  const exact = segments.find((segment) => segmentContainsQuote(segment, trimmed));
  if (exact) return exact;

  const needle = normalizeEvidenceText(trimmed);
  if (needle.length < 12) return undefined;
  let best: { segment: TranscriptSegment; score: number } | undefined;
  for (const segment of segments) {
    for (const text of [segment.rawText, segment.cleanText, segment.romanHinglishText]) {
      const haystack = normalizeEvidenceText(text);
      if (!haystack) continue;
      if (haystack.includes(needle) || needle.includes(haystack)) {
        const score = Math.min(haystack.length, needle.length)
          / Math.max(haystack.length, needle.length);
        if (!best || score > best.score) best = { segment, score };
      }
    }
  }
  return best && best.score >= 0.35 ? best.segment : undefined;
}

/** Authoritative IDs only — do not alias Ollama IDs by array index (breaks long recordings). */
export function buildSegmentLookup(
  authoritative: TranscriptSegment[],
): Map<string, TranscriptSegment> {
  const byId = new Map<string, TranscriptSegment>();
  for (const segment of authoritative) {
    byId.set(segment.id, segment);
  }
  return byId;
}

export function attachEvidence<T extends ClaimWithEvidence>(
  claim: T,
  segmentsById: Map<string, TranscriptSegment>,
  segments: TranscriptSegment[] = [...segmentsById.values()],
): T & {
  startMs: number | null;
  speakerLabel: string | null;
  segmentId: string | null;
  quote: string | null;
} {
  const quote = claim.quote?.trim() || null;
  const byId = claim.segmentId ? segmentsById.get(claim.segmentId) : undefined;
  const segment = byId && (!quote || segmentContainsQuote(byId, quote))
    ? byId
    : findSegmentByQuote(segments, quote);

  if (!segment) {
    return {
      ...claim,
      segmentId: null,
      quote,
      startMs: null,
      speakerLabel: null,
    };
  }
  return {
    ...claim,
    segmentId: segment.id,
    quote,
    startMs: segment.startMs,
    speakerLabel: segment.speakerLabel,
  };
}

export function formatUtteranceForUnderstanding(
  utterance: { startMs: number; endMs: number; speaker: number; text: string },
  index: number,
): string {
  const id = `segment-${index + 1}`;
  return `[${id} | ${utterance.startMs}-${utterance.endMs}] Speaker ${utterance.speaker + 1}: ${utterance.text}`;
}
