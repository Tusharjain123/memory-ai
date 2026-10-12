import type { DeepgramResult } from "../processing/deepgram.service.js";

/** One line from Meet's transcripts.entries API. */
export type MeetTranscriptEntry = {
  participant?: string;
  text?: string;
  languageCode?: string;
  startTime?: string;
  endTime?: string;
};

const MERGE_GAP_MS = 2_000;

function primaryLanguage(entries: MeetTranscriptEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const code = entry.languageCode?.split("-")[0]?.toLowerCase();
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return "en";
  // Several languages spoken in one meeting: let the pipeline treat it as mixed.
  return ranked.length > 1 && ranked[1]![1] >= ranked[0]![1] * 0.2 ? "multi" : ranked[0]![0];
}

/**
 * Converts Meet transcript entries into the pipeline's transcript shape.
 * Speakers are numbered by first appearance; people who rejoined (new
 * participant ids, same display name) share one speaker.
 */
export function meetEntriesToTranscript(
  entries: MeetTranscriptEntry[],
  participantNames: ReadonlyMap<string, string>,
): DeepgramResult {
  const timed = entries
    .filter((entry) => entry.text?.trim() && entry.startTime)
    .map((entry) => {
      const startMs = Date.parse(entry.startTime!);
      const endMs = entry.endTime ? Date.parse(entry.endTime) : startMs;
      return { entry, startMs, endMs: Math.max(startMs, endMs) };
    })
    .filter((item) => Number.isFinite(item.startMs))
    .sort((a, b) => a.startMs - b.startMs);
  if (!timed.length) {
    return { rawTranscript: "", language: "en", durationMs: 0, utterances: [], speakerNames: [] };
  }

  const origin = timed[0]!.startMs;
  const speakerNames: string[] = [];
  const speakerByKey = new Map<string, number>();
  const speakerFor = (participant: string | undefined): number => {
    const name = participant ? participantNames.get(participant)?.trim() : undefined;
    const key = name ? `name:${name.toLocaleLowerCase()}` : `id:${participant ?? "unknown"}`;
    let speaker = speakerByKey.get(key);
    if (speaker == null) {
      speaker = speakerNames.length;
      speakerByKey.set(key, speaker);
      // Empty name → the pipeline falls back to "Speaker N".
      speakerNames.push(name ?? "");
    }
    return speaker;
  };

  const utterances: DeepgramResult["utterances"] = [];
  for (const { entry, startMs, endMs } of timed) {
    const speaker = speakerFor(entry.participant);
    const text = entry.text!.trim();
    const relativeStart = startMs - origin;
    const relativeEnd = endMs - origin;
    const previous = utterances[utterances.length - 1];
    if (previous && previous.speaker === speaker && relativeStart - previous.endMs < MERGE_GAP_MS) {
      previous.text = `${previous.text} ${text}`;
      previous.endMs = Math.max(previous.endMs, relativeEnd);
      continue;
    }
    utterances.push({ speaker, startMs: relativeStart, endMs: relativeEnd, text });
  }

  return {
    rawTranscript: utterances.map((utterance) => utterance.text).join("\n"),
    language: primaryLanguage(timed.map((item) => item.entry)),
    durationMs: Math.max(...utterances.map((utterance) => utterance.endMs)),
    utterances,
    speakerNames,
  };
}
