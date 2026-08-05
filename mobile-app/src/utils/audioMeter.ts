/** Maps recorder decibels to a visual 0–1 level with a room-noise gate. */
export function normalizeMetering(decibels: number): number {
  if (!Number.isFinite(decibels) || decibels <= -55) return 0;
  if (decibels >= -5) return 1;
  const normalized = (decibels + 55) / 50;
  return Math.pow(normalized, 1.15);
}

export function nextMeterLevels(current: number[], level: number): number[] {
  const decayed = current.map((item) => item * (level === 0 ? 0.7 : 0.9));
  return [...decayed.slice(1), level];
}
