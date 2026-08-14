export type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  speaker?: number;
  speaker_confidence?: number;
};

export type DeepgramUtterance = {
  speaker: number;
  startMs: number;
  endMs: number;
  text: string;
};

const MIN_FRAGMENT_MS = 250;

/**
 * Rebuild speaker turns from word-level diarization labels.
 * Splits whenever consecutive words change speaker — better than utterance
 * bundling when 3+ people talk or overlap.
 */
export function rebuildUtterancesFromWords(
  words: DeepgramWord[],
): DeepgramUtterance[] {
  const usable = words.filter((word) => {
    const text = (word.punctuated_word ?? word.word ?? "").trim();
    return Boolean(text) && typeof word.start === "number" && typeof word.end === "number";
  });
  if (!usable.length) return [];

  const turns: DeepgramUtterance[] = [];
  let currentSpeaker = usable[0]?.speaker ?? 0;
  let start = usable[0]?.start ?? 0;
  let end = usable[0]?.end ?? start;
  let parts: string[] = [];

  const flush = () => {
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    const startMs = Math.round(start * 1000);
    const endMs = Math.round(end * 1000);
    const durationMs = endMs - startMs;
    const tokenCount = parts.length;
    // Drop ultra-short single-token speaker flips (back-channels / jitter).
    if (text && !(tokenCount <= 1 && durationMs < MIN_FRAGMENT_MS)) {
      turns.push({
        speaker: currentSpeaker,
        startMs,
        endMs: Math.max(endMs, startMs),
        text,
      });
    } else if (text && turns.length) {
      // Merge tiny flip into previous turn instead of inventing a speaker.
      const previous = turns[turns.length - 1]!;
      previous.text = `${previous.text} ${text}`.trim();
      previous.endMs = Math.max(previous.endMs, endMs);
    } else if (text) {
      turns.push({
        speaker: currentSpeaker,
        startMs,
        endMs: Math.max(endMs, startMs),
        text,
      });
    }
    parts = [];
  };

  for (const word of usable) {
    const speaker = word.speaker ?? 0;
    const token = (word.punctuated_word ?? word.word ?? "").trim();
    if (speaker !== currentSpeaker && parts.length) {
      flush();
      currentSpeaker = speaker;
      start = word.start ?? end;
    }
    if (!parts.length) {
      currentSpeaker = speaker;
      start = word.start ?? 0;
    }
    parts.push(token);
    end = word.end ?? end;
  }
  flush();
  return turns;
}
