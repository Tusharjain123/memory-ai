import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  playbackAutoStopMs,
  type PlaybackMode,
  type PlayerMode,
} from "./playback";

export { EVIDENCE_CLIP_MS, playbackAutoStopMs } from "./playback";
export type { PlaybackMode, PlayerMode } from "./playback";

export type ClipPlayerState = {
  playing: boolean;
  available: boolean;
  error: string | null;
  currentTimeMs: number;
  durationMs: number;
  mode: PlayerMode;
  playFrom: (startMs: number) => Promise<void>;
  playFull: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seekTo: (ms: number) => Promise<void>;
  stop: () => void;
};

function toMs(seconds: number | undefined): number {
  if (!Number.isFinite(seconds) || !seconds || seconds < 0) return 0;
  return Math.round(seconds * 1000);
}

export function useClipPlayer(recordingUri: string | null | undefined): ClipPlayerState {
  const uri = recordingUri?.trim() || null;
  const player = useAudioPlayer(uri ?? undefined);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PlayerMode>("idle");
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStopTimer = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearStopTimer();
  }, [clearStopTimer]);

  useEffect(() => {
    setError(null);
    setMode("idle");
    clearStopTimer();
  }, [uri, clearStopTimer]);

  const stop = useCallback(() => {
    clearStopTimer();
    setMode("idle");
    try {
      player.pause();
    } catch {
      // Player may already be released.
    }
  }, [clearStopTimer, player]);

  const armAutoStop = useCallback((playbackMode: PlaybackMode) => {
    clearStopTimer();
    const autoStopMs = playbackAutoStopMs(playbackMode);
    if (autoStopMs == null) return;
    stopTimer.current = setTimeout(() => {
      try {
        player.pause();
      } catch {
        // ignore
      }
      setMode("idle");
    }, autoStopMs);
  }, [clearStopTimer, player]);

  const playFrom = useCallback(async (startMs: number) => {
    if (!uri) {
      setError("Original audio was removed from this device.");
      return;
    }
    setError(null);
    setMode("clip");
    try {
      await player.seekTo(Math.max(0, startMs) / 1000);
      player.play();
      armAutoStop("clip");
    } catch (cause) {
      setMode("idle");
      setError(cause instanceof Error ? cause.message : "Could not play this clip");
    }
  }, [armAutoStop, player, uri]);

  const playFull = useCallback(async () => {
    if (!uri) {
      setError("Original audio was removed from this device.");
      return;
    }
    setError(null);
    setMode("full");
    try {
      const duration = status.duration ?? 0;
      const current = status.currentTime ?? 0;
      if (duration > 0 && current >= duration - 0.25) {
        await player.seekTo(0);
      }
      player.play();
      armAutoStop("full");
    } catch (cause) {
      setMode("idle");
      setError(cause instanceof Error ? cause.message : "Could not play this recording");
    }
  }, [armAutoStop, player, status.currentTime, status.duration, uri]);

  const togglePlay = useCallback(async () => {
    if (status.playing && mode === "full") {
      clearStopTimer();
      try {
        player.pause();
      } catch {
        // ignore
      }
      return;
    }
    await playFull();
  }, [clearStopTimer, mode, playFull, player, status.playing]);

  const seekTo = useCallback(async (ms: number) => {
    if (!uri) return;
    clearStopTimer();
    if (mode === "clip") setMode("full");
    try {
      await player.seekTo(Math.max(0, ms) / 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not seek this recording");
    }
  }, [clearStopTimer, mode, player, uri]);

  return {
    playing: Boolean(status.playing),
    available: Boolean(uri),
    error,
    currentTimeMs: toMs(status.currentTime),
    durationMs: toMs(status.duration),
    mode,
    playFrom,
    playFull,
    togglePlay,
    seekTo,
    stop,
  };
}
