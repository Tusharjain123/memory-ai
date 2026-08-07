/** Normalized amplitude below this counts as near-silence for muffled detection. */
export const MUFFLED_LEVEL_THRESHOLD = 0.08;

/** Consecutive low samples required before showing the pocket/covered hint (~5s at 80ms poll). */
export const MUFFLED_SAMPLE_THRESHOLD = 62;

/** Samples of recovered speech needed to clear the hint. */
export const MUFFLED_RECOVERY_SAMPLES = 8;

export type MuffledDetectorState = {
  lowStreak: number;
  speechStreak: number;
  muffled: boolean;
};

export function createMuffledDetectorState(): MuffledDetectorState {
  return { lowStreak: 0, speechStreak: 0, muffled: false };
}

/**
 * Tracks sustained near-silence during recording to hint that the phone may be
 * covered or in a pocket. Pure state machine — no timers.
 */
export function nextMuffledDetectorState(
  state: MuffledDetectorState,
  level: number,
  options: {
    lowThreshold?: number;
    sampleThreshold?: number;
    recoverySamples?: number;
  } = {},
): MuffledDetectorState {
  const lowThreshold = options.lowThreshold ?? MUFFLED_LEVEL_THRESHOLD;
  const sampleThreshold = options.sampleThreshold ?? MUFFLED_SAMPLE_THRESHOLD;
  const recoverySamples = options.recoverySamples ?? MUFFLED_RECOVERY_SAMPLES;
  const sample = Math.max(0, Math.min(1, level));

  if (sample <= lowThreshold) {
    const lowStreak = state.lowStreak + 1;
    return {
      lowStreak,
      speechStreak: 0,
      muffled: state.muffled || lowStreak >= sampleThreshold,
    };
  }

  const speechStreak = state.speechStreak + 1;
  if (!state.muffled) {
    return { lowStreak: 0, speechStreak: 0, muffled: false };
  }
  if (speechStreak >= recoverySamples) {
    return { lowStreak: 0, speechStreak: 0, muffled: false };
  }
  return { lowStreak: 0, speechStreak, muffled: true };
}
