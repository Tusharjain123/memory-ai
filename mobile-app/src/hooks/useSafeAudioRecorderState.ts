import type { AudioRecorder, RecorderState } from "expo-audio";
import { useEffect, useState } from "react";

const EMPTY_RECORDER_STATE: RecorderState = {
  canRecord: false,
  isRecording: false,
  durationMillis: 0,
  mediaServicesDidReset: false,
  url: null,
};

type SafeAudioRecorderStateOptions = {
  enabled: boolean;
  intervalMs?: number;
  pollWhilePaused?: boolean;
};

function getStatusSafely(recorder: AudioRecorder, fallback: RecorderState): RecorderState {
  try {
    return recorder.getStatus();
  } catch {
    // Android MediaRecorder can reject getStatus while it is stopping.
    return fallback;
  }
}

export function useSafeAudioRecorderState(
  recorder: AudioRecorder,
  { enabled, intervalMs = 500, pollWhilePaused = false }: SafeAudioRecorderStateOptions,
): RecorderState {
  const [state, setState] = useState<RecorderState>(() => getStatusSafely(recorder, EMPTY_RECORDER_STATE));

  useEffect(() => {
    if (!enabled) return;

    const updateState = () => {
      if (!recorder.isRecording && !pollWhilePaused) return;
      setState((current) => getStatusSafely(recorder, current));
    };
    updateState();
    const interval = setInterval(updateState, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, intervalMs, pollWhilePaused, recorder.id]);

  return state;
}
