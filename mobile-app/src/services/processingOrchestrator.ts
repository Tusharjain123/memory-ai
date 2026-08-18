import { AppState, type AppStateStatus } from "react-native";
import {
  getPendingRecording,
  listPendingRecordings,
  setPendingRecordingError,
  type PendingRecording,
} from "../db/pendingRecordings";
import { saveConversation } from "../db/conversations";
import { processRecording } from "./processing";

export type ProcessingJobSnapshot = {
  pendingId: string;
  status: "idle" | "running" | "complete" | "failed";
  progress: number | null;
  conversationId: string | null;
  error: string | null;
};

type Listener = (snapshot: ProcessingJobSnapshot) => void;

const listeners = new Set<Listener>();
const inFlight = new Map<string, Promise<string>>();
const snapshots = new Map<string, ProcessingJobSnapshot>();
let appStateBound = false;

function emit(snapshot: ProcessingJobSnapshot): void {
  snapshots.set(snapshot.pendingId, snapshot);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // Subscriber errors must not break processing.
    }
  }
}

function patch(
  pendingId: string,
  update: Partial<ProcessingJobSnapshot>,
): ProcessingJobSnapshot {
  const current = snapshots.get(pendingId) ?? {
    pendingId,
    status: "idle" as const,
    progress: null,
    conversationId: null,
    error: null,
  };
  const next = { ...current, ...update, pendingId };
  emit(next);
  return next;
}

export function getProcessingSnapshot(pendingId: string): ProcessingJobSnapshot | null {
  return snapshots.get(pendingId) ?? null;
}

export function subscribeProcessing(listener: Listener): () => void {
  listeners.add(listener);
  for (const snapshot of snapshots.values()) {
    if (snapshot.status === "running") listener(snapshot);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function isProcessingPending(pendingId: string): boolean {
  return inFlight.has(pendingId);
}

async function runPending(item: PendingRecording): Promise<string> {
  patch(item.id, {
    status: "running",
    progress: item.processingJobId && !item.lastError ? 15 : 1,
    error: null,
  });
  try {
    const result = await processRecording(item.recordingUri, {
      pendingId: item.id,
      ...(item.durationMs != null ? { durationMs: item.durationMs } : {}),
      resumeUploadId: item.uploadId,
      startPartIndex: item.uploadPartIndex ?? 0,
      onProgress: (progress) => {
        patch(item.id, { status: "running", progress });
      },
    });
    const conversationId = await saveConversation(result, item.recordingUri, item.id);
    patch(item.id, {
      status: "complete",
      progress: 100,
      conversationId,
      error: null,
    });
    // Drop terminal snapshot shortly after so remounts do not re-navigate.
    setTimeout(() => {
      snapshots.delete(item.id);
    }, 2_000);
    return conversationId;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Processing is unavailable";
    await setPendingRecordingError(item.id, message);
    patch(item.id, {
      status: "failed",
      progress: null,
      conversationId: null,
      error: message,
    });
    setTimeout(() => {
      snapshots.delete(item.id);
    }, 2_000);
    throw cause instanceof Error ? cause : new Error(message);
  } finally {
    inFlight.delete(item.id);
  }
}

/** Start or reuse poll+save for a pending recording. Dedupes concurrent callers. */
export function ensureProcessing(pendingId: string): Promise<string> {
  const existing = inFlight.get(pendingId);
  if (existing) return existing;

  const task = (async () => {
    const item = await getPendingRecording(pendingId);
    if (!item) throw new Error("Saved recording was removed");
    return runPending(item);
  })();

  inFlight.set(pendingId, task);
  return task;
}

/** Resume any queued jobs that already have a processingJobId and no lastError. */
export async function resumeQueuedJobs(): Promise<void> {
  const items = await listPendingRecordings();
  for (const item of items) {
    if (!item.processingJobId || item.lastError) continue;
    if (inFlight.has(item.id)) continue;
    void ensureProcessing(item.id).catch(() => {
      // Errors are stored on the pending row and emitted to listeners.
    });
  }
}

export function bindProcessingAppState(): () => void {
  if (appStateBound) return () => undefined;
  appStateBound = true;
  void resumeQueuedJobs();
  const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") void resumeQueuedJobs();
  });
  return () => {
    appStateBound = false;
    subscription.remove();
  };
}
