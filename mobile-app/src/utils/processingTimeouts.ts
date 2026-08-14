/** max(900s, duration*2+180s), capped at 150 min; 30 min when unknown. */
export function computePollDeadlineMs(durationSec?: number): number {
  if (!durationSec || durationSec <= 0) {
    return 30 * 60_000;
  }
  return Math.min(
    150 * 60_000,
    Math.max(900_000, durationSec * 2_000 + 180_000),
  );
}

export const MAX_RECORDING_MS = 3 * 60 * 60_000;
export const SINGLE_UPLOAD_MAX_BYTES = 52_428_800;
export const UPLOAD_PART_BYTES = 20_971_520;
