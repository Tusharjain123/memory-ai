export const EVIDENCE_CLIP_MS = 12_000;

export type PlaybackMode = "clip" | "full";
export type PlayerMode = PlaybackMode | "idle";

export function playbackAutoStopMs(mode: PlaybackMode): number | null {
  return mode === "clip" ? EVIDENCE_CLIP_MS : null;
}
