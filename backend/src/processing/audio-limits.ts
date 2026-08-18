export const MAX_AUDIO_DURATION_SEC = 10_800; // 3 hours
export const MAX_UPLOAD_BYTES = 209_715_200; // 200 MB
export const UPLOAD_PART_BYTES = 4_194_304; // 4 MB parts so cellular uploads finish
export const SINGLE_UPLOAD_MAX_BYTES = 52_428_800; // 50 MB fast path on mobile

export function maxAudioDurationSec(): number {
  const parsed = Number(process.env.MAX_AUDIO_DURATION_SEC);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_AUDIO_DURATION_SEC;
}

export function maxUploadBytes(): number {
  const parsed = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_UPLOAD_BYTES;
}

export function uploadPartBytes(): number {
  const parsed = Number(process.env.UPLOAD_PART_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : UPLOAD_PART_BYTES;
}

export function assertWithinDurationLimit(durationSec: number): void {
  const max = maxAudioDurationSec();
  if (durationSec > max) {
    throw new Error(
      `Recording exceeds the ${Math.round(max / 3600)} hour limit (${Math.round(durationSec / 60)} minutes)`,
    );
  }
}

export function assertWithinUploadLimit(totalBytes: number): void {
  const max = maxUploadBytes();
  if (totalBytes > max) {
    throw new Error(
      `Upload exceeds the ${Math.round(max / (1024 * 1024))} MB limit`,
    );
  }
}
