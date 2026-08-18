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
export const UPLOAD_PART_BYTES = 4_194_304;
export const UPLOAD_PROGRESS_START = 1;
export const UPLOAD_PROGRESS_MAX = 15;
export const QUEUED_PROGRESS = 15;

export function uploadPartProgress(completedParts: number, partCount: number): number {
  if (partCount <= 0) return UPLOAD_PROGRESS_START;
  const span = UPLOAD_PROGRESS_MAX - UPLOAD_PROGRESS_START;
  return Math.min(
    UPLOAD_PROGRESS_MAX,
    UPLOAD_PROGRESS_START + Math.round((Math.max(0, completedParts) / partCount) * span),
  );
}

export function processingStageLabel(progress: number): string {
  if (progress < UPLOAD_PROGRESS_MAX) return "Uploading";
  if (progress < 25) return "Preparing";
  if (progress < 70) return "Transcribing";
  if (progress < 100) return "Understanding";
  return "Done";
}
