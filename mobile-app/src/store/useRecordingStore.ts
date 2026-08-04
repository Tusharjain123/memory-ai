import { create } from "zustand";

type RecordingStatus = "idle" | "recording" | "paused" | "processing" | "error";

type RecordingState = {
  status: RecordingStatus;
  elapsedMs: number;
  error: string | null;
  setStatus: (status: RecordingStatus) => void;
  setElapsedMs: (elapsedMs: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useRecordingStore = create<RecordingState>((set) => ({
  status: "idle",
  elapsedMs: 0,
  error: null,
  setStatus: (status) => set({ status }),
  setElapsedMs: (elapsedMs) => set({ elapsedMs }),
  setError: (error) => set({ error, status: error ? "error" : "idle" }),
  reset: () => set({ status: "idle", elapsedMs: 0, error: null }),
}));
