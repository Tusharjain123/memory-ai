/** Normalized amplitude above silence but still “far from mic” (table distance). */
export const DISTANT_LOW = 0.08;
export const DISTANT_HIGH = 0.28;

/** ~4s of distant levels at 80ms poll before showing the tip. */
export const DISTANT_SAMPLE_THRESHOLD = 50;
export const DISTANT_RECOVERY_SAMPLES = 10;

export type DistantMicDetectorState = {
  distantStreak: number;
  clearStreak: number;
  distant: boolean;
};

export function createDistantMicDetectorState(): DistantMicDetectorState {
  return { distantStreak: 0, clearStreak: 0, distant: false };
}

/**
 * Detects sustained low-but-audible levels typical of a phone left on a table.
 * Distinct from muffled/pocket near-silence.
 */
export function nextDistantMicDetectorState(
  state: DistantMicDetectorState,
  level: number,
  options: {
    low?: number;
    high?: number;
    sampleThreshold?: number;
    recoverySamples?: number;
  } = {},
): DistantMicDetectorState {
  const low = options.low ?? DISTANT_LOW;
  const high = options.high ?? DISTANT_HIGH;
  const sampleThreshold = options.sampleThreshold ?? DISTANT_SAMPLE_THRESHOLD;
  const recoverySamples = options.recoverySamples ?? DISTANT_RECOVERY_SAMPLES;
  const sample = Math.max(0, Math.min(1, level));
  const isDistantBand = sample > low && sample <= high;

  if (isDistantBand) {
    const distantStreak = state.distantStreak + 1;
    return {
      distantStreak,
      clearStreak: 0,
      distant: state.distant || distantStreak >= sampleThreshold,
    };
  }

  if (sample <= low) {
    // Near-silence is handled by muffled detector; don't clear distant here
    // unless we already were distant and stay quiet briefly.
    return { ...state, distantStreak: 0, clearStreak: 0 };
  }

  const clearStreak = state.clearStreak + 1;
  if (!state.distant) {
    return { distantStreak: 0, clearStreak: 0, distant: false };
  }
  if (clearStreak >= recoverySamples) {
    return { distantStreak: 0, clearStreak: 0, distant: false };
  }
  return { distantStreak: 0, clearStreak, distant: true };
}
