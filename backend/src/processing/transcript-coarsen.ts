import type { DeepgramResult } from "./deepgram.service.js";

const LONG_UTTERANCE_THRESHOLD = 200;
const DEFAULT_TARGET_BLOCK_MS = 45_000;
const LONG_DURATION_TARGET_BLOCK_MS = 60_000;
const MAX_COARSENED_UTTERANCES = 150;
const EXCERPT_HEAD = 30;
const EXCERPT_TAIL = 20;

export function isLongTranscript(transcript: DeepgramResult): boolean {
  return transcript.utterances.length > LONG_UTTERANCE_THRESHOLD;
}

export function targetBlockMsForDuration(durationMs: number): number {
  return durationMs > 3_600_000 ? LONG_DURATION_TARGET_BLOCK_MS : DEFAULT_TARGET_BLOCK_MS;
}

/** Merge consecutive same-speaker turns for LLM understanding on long clips. */
export function coarsenUtterancesForUnderstanding(
  utterances: DeepgramResult["utterances"],
  targetBlockMs = DEFAULT_TARGET_BLOCK_MS,
): DeepgramResult["utterances"] {
  if (utterances.length <= LONG_UTTERANCE_THRESHOLD) return utterances;

  const merged: DeepgramResult["utterances"] = [];
  let current: DeepgramResult["utterances"][number] | null = null;

  for (const utterance of utterances) {
    if (!current) {
      current = { ...utterance };
      continue;
    }
    const blockDurationMs = utterance.endMs - current.startMs;
    if (utterance.speaker === current.speaker && blockDurationMs < targetBlockMs) {
      current = {
        ...current,
        endMs: utterance.endMs,
        text: `${current.text} ${utterance.text}`.replace(/\s+/g, " ").trim(),
      };
    } else {
      merged.push(current);
      current = { ...utterance };
    }
  }

  if (current) merged.push(current);
  return merged;
}

export function excerptUtterancesForUnderstanding(
  utterances: DeepgramResult["utterances"],
): DeepgramResult["utterances"] {
  if (utterances.length <= MAX_COARSENED_UTTERANCES) return utterances;
  const head = utterances.slice(0, EXCERPT_HEAD);
  const tail = utterances.slice(-EXCERPT_TAIL);
  const middleBudget = MAX_COARSENED_UTTERANCES - head.length - tail.length - 1;
  const middle = utterances.slice(EXCERPT_HEAD, -EXCERPT_TAIL);
  const step = Math.max(1, Math.ceil(middle.length / Math.max(1, middleBudget)));
  const sampled = middle.filter((_, index) => index % step === 0).slice(0, middleBudget);
  return [
    ...head,
    {
      speaker: head[head.length - 1]?.speaker ?? 0,
      startMs: head[head.length - 1]?.endMs ?? 0,
      endMs: head[head.length - 1]?.endMs ?? 0,
      text: "[… middle of conversation omitted from LLM prompt …]",
    },
    ...sampled,
    ...tail,
  ];
}

export function prepareUnderstandingUtterances(
  transcript: DeepgramResult,
): DeepgramResult["utterances"] {
  const coarsened = coarsenUtterancesForUnderstanding(
    transcript.utterances,
    targetBlockMsForDuration(transcript.durationMs),
  );
  if (coarsened.length > MAX_COARSENED_UTTERANCES) {
    return excerptUtterancesForUnderstanding(coarsened);
  }
  return coarsened;
}

export function segmentsFromRawUtterances(
  utterances: DeepgramResult["utterances"],
): Array<{
  id: string;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  rawText: string;
  cleanText: string;
  romanHinglishText: string;
}> {
  return utterances.map((utterance, index) => ({
    id: `segment-${index + 1}`,
    speakerLabel: `Speaker ${utterance.speaker + 1}`,
    startMs: utterance.startMs,
    endMs: utterance.endMs,
    rawText: utterance.text,
    cleanText: utterance.text,
    romanHinglishText: utterance.text,
  }));
}
