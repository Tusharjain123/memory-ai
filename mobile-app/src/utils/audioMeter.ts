const NOISE_FLOOR_DB = -55;
const VISUAL_PEAK_DB = -5;

/** Maps recorder decibels to a visual 0–1 amplitude with a room-noise gate. */
export function normalizeMetering(decibels: number): number {
  if (!Number.isFinite(decibels) || decibels <= NOISE_FLOOR_DB) return 0;
  if (decibels >= VISUAL_PEAK_DB) return 1;

  // Metering is logarithmic. Convert dB to linear amplitude before scaling it
  // into the visible range; cube-root gamma keeps normal speech legible.
  const amplitude = Math.pow(10, decibels / 20);
  const floorAmplitude = Math.pow(10, NOISE_FLOOR_DB / 20);
  const peakAmplitude = Math.pow(10, VISUAL_PEAK_DB / 20);
  const normalized =
    (amplitude - floorAmplitude) / (peakAmplitude - floorAmplitude);

  return Math.cbrt(Math.max(0, Math.min(1, normalized)));
}

export function nextMeterLevels(current: number[], level: number): number[] {
  if (!current.length) return [];
  const sample = Math.max(0, Math.min(1, level));
  return [...current.slice(1), sample];
}
