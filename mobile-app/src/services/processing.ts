import type {
  ProcessedConversation,
  ProcessingJobState,
} from "../contracts";
import { API_URL } from "../config/api";
import { listPeople } from "../db/insights";
import { getUserProfile } from "../db/profile";
import {
  computePollDeadlineMs,
  QUEUED_PROGRESS,
  SINGLE_UPLOAD_MAX_BYTES,
  UPLOAD_PART_BYTES,
  UPLOAD_PROGRESS_MAX,
  UPLOAD_PROGRESS_START,
  uploadPartProgress,
} from "../utils/processingTimeouts";
import {
  getPendingRecording,
  updatePendingUploadState,
} from "../db/pendingRecordings";

export type ProcessRecordingOptions = {
  durationMs?: number;
  onProgress?: (progress: number) => void;
  pendingId?: string;
  resumeUploadId?: string | null;
  startPartIndex?: number;
};

export { computePollDeadlineMs } from "../utils/processingTimeouts";

export function shouldPollExistingJob(pending: {
  processingJobId: string | null;
  lastError: string | null;
}): boolean {
  return Boolean(pending.processingJobId && !pending.lastError);
}

/** Upload sessions are deleted after a failed transcription job. */
export function shouldReuseUploadSession(pending: {
  processingJobId: string | null;
  lastError: string | null;
}): boolean {
  return !(pending.lastError && pending.processingJobId);
}

export async function estimateDurationSec(uri: string): Promise<number | undefined> {
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || typeof info.size !== "number" || info.size <= 0) {
      return undefined;
    }
    return info.size / 16_000;
  } catch {
    return undefined;
  }
}

async function getFileSize(uri: string): Promise<number> {
  const FileSystem = await import("expo-file-system/legacy");
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || typeof info.size !== "number" || info.size <= 0) {
    throw new Error("Could not read the recording file size");
  }
  return info.size;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(750 * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed");
}

async function collectKeyterms(): Promise<string[]> {
  const terms = new Set<string>();
  try {
    const profile = await getUserProfile();
    const profileName = profile?.name.trim();
    if (profileName) terms.add(profileName);
  } catch {
    // Profile is optional.
  }
  try {
    const people = await listPeople();
    for (const person of people.slice(0, 40)) {
      const name = person.name.trim();
      if (name && !/^speaker\s+\d+/i.test(name)) terms.add(name);
    }
  } catch {
    // People list is optional for transcription boost.
  }
  return [...terms].slice(0, 40);
}

export async function startProcessing(
  uri: string,
  options: ProcessRecordingOptions = {},
): Promise<{ jobId: string; uploadId: string | null }> {
  options.onProgress?.(UPLOAD_PROGRESS_START);
  const keyterms = await collectKeyterms();
  const totalBytes = await getFileSize(uri);
  const durationMs = options.durationMs ?? Math.round((totalBytes / 16_000) * 1000);

  if (totalBytes <= SINGLE_UPLOAD_MAX_BYTES) {
    const jobId = await uploadSingle(uri, keyterms, durationMs, options.onProgress);
    if (options.pendingId) {
      await updatePendingUploadState(options.pendingId, {
        processingJobId: jobId,
        uploadId: null,
        uploadPartIndex: null,
        lastError: null,
      });
    }
    return { jobId, uploadId: null };
  }

  const { jobId, uploadId, lastPartIndex } = await uploadMultipart(
    uri,
    totalBytes,
    keyterms,
    durationMs,
    options,
  );
  if (options.pendingId) {
    await updatePendingUploadState(options.pendingId, {
      processingJobId: jobId,
      uploadId,
      uploadPartIndex: lastPartIndex,
      lastError: null,
    });
  }
  return { jobId, uploadId };
}

export async function processRecording(
  uri: string,
  options: ProcessRecordingOptions = {},
): Promise<ProcessedConversation> {
  const pending = options.pendingId ? await getPendingRecording(options.pendingId) : null;
  const durationSec = (options.durationMs ?? pending?.durationMs ?? undefined)
    ? (options.durationMs ?? pending!.durationMs)! / 1000
    : await estimateDurationSec(uri);

  if (pending && shouldPollExistingJob(pending)) {
    return poll(pending.processingJobId!, durationSec, options.onProgress);
  }

  options.onProgress?.(UPLOAD_PROGRESS_START);
  const reuseUpload = pending ? shouldReuseUploadSession(pending) : true;
  const { jobId } = await startProcessing(
    uri,
    reuseUpload
      ? options
      : { ...options, resumeUploadId: null, startPartIndex: 0 },
  );
  options.onProgress?.(QUEUED_PROGRESS);
  return poll(jobId, durationSec, options.onProgress);
}

async function uploadSingle(
  uri: string,
  keyterms: string[],
  durationMs: number,
  onProgress?: (progress: number) => void,
): Promise<string> {
  onProgress?.(UPLOAD_PROGRESS_START);
  const form = new FormData();
  form.append("audio", {
    uri,
    name: `conversation-${Date.now()}.m4a`,
    type: "audio/mp4",
  } as unknown as Blob);
  form.append("durationMs", String(durationMs));
  if (keyterms.length) {
    form.append("keyterms", JSON.stringify(keyterms));
  }

  const response = await withRetries(() => fetch(`${API_URL}/v1/conversations/process`, {
    method: "POST",
    body: form,
  }));
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Processing failed (${response.status})`);
  }
  const queued = (await response.json()) as ProcessingJobState;
  if (queued.status !== "queued") throw new Error("The processing job was not queued");
  onProgress?.(UPLOAD_PROGRESS_MAX);
  return queued.jobId;
}

async function uploadMultipart(
  uri: string,
  totalBytes: number,
  keyterms: string[],
  durationMs: number,
  options: ProcessRecordingOptions,
): Promise<{ jobId: string; uploadId: string; lastPartIndex: number }> {
  const FileSystem = await import("expo-file-system/legacy");
  const partSize = UPLOAD_PART_BYTES;
  const partCount = Math.ceil(totalBytes / partSize);
  let uploadId = options.resumeUploadId ?? null;
  let startPart = options.startPartIndex ?? 0;

  if (!uploadId) {
    const initResponse = await withRetries(() => fetch(`${API_URL}/v1/conversations/process/upload/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: `conversation-${Date.now()}.m4a`,
        mimetype: "audio/mp4",
        totalBytes,
        durationMs,
        keyterms,
      }),
    }));
    if (!initResponse.ok) {
      throw new Error(await initResponse.text() || `Upload init failed (${initResponse.status})`);
    }
    const initPayload = (await initResponse.json()) as { uploadId: string };
    uploadId = initPayload.uploadId;
    if (options.pendingId) {
      await updatePendingUploadState(options.pendingId, {
        uploadId,
        uploadPartIndex: 0,
        lastError: null,
      });
    }
  }

  options.onProgress?.(uploadPartProgress(startPart, partCount));
  for (let partIndex = startPart; partIndex < partCount; partIndex += 1) {
    options.onProgress?.(uploadPartProgress(partIndex, partCount));
    const offset = partIndex * partSize;
    const length = Math.min(partSize, totalBytes - offset);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length,
    });
    const chunkUri = `${FileSystem.cacheDirectory ?? ""}upload-${uploadId}-${partIndex}.bin`;
    await FileSystem.writeAsStringAsync(chunkUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await withRetries(async () => {
      const form = new FormData();
      form.append("uploadId", uploadId!);
      form.append("partIndex", String(partIndex));
      form.append("offset", String(offset));
      form.append("part", {
        uri: chunkUri,
        name: `part-${partIndex}.bin`,
        type: "application/octet-stream",
      } as unknown as Blob);
      const response = await fetch(`${API_URL}/v1/conversations/process/upload/part`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        throw new Error(await response.text() || `Upload part failed (${response.status})`);
      }
    });

    await FileSystem.deleteAsync(chunkUri, { idempotent: true });
    if (options.pendingId) {
      await updatePendingUploadState(options.pendingId, {
        uploadId,
        uploadPartIndex: partIndex + 1,
      });
    }
    options.onProgress?.(uploadPartProgress(partIndex + 1, partCount));
  }
  options.onProgress?.(UPLOAD_PROGRESS_MAX);

  const completeResponse = await withRetries(() => fetch(
    `${API_URL}/v1/conversations/process/upload/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    },
  ));
  if (!completeResponse.ok) {
    throw new Error(await completeResponse.text() || `Upload complete failed (${completeResponse.status})`);
  }
  const queued = (await completeResponse.json()) as ProcessingJobState;
  if (queued.status !== "queued") throw new Error("The processing job was not queued");
  return { jobId: queued.jobId, uploadId: uploadId!, lastPartIndex: partCount };
}

async function poll(
  jobId: string,
  durationSec?: number,
  onProgress?: (progress: number) => void,
): Promise<ProcessedConversation> {
  const deadline = Date.now() + computePollDeadlineMs(durationSec);
  while (Date.now() < deadline) {
    await sleep(1_250);
    const response = await fetch(`${API_URL}/v1/conversations/process/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (!response.ok) throw new Error(`Could not check processing (${response.status})`);
    const state = (await response.json()) as ProcessingJobState;
    if (state.status === "queued") {
      onProgress?.(QUEUED_PROGRESS);
    }
    if (state.status === "processing" && typeof state.progress === "number") {
      onProgress?.(Math.max(QUEUED_PROGRESS, state.progress));
    }
    if (state.status === "complete") return state.result;
    if (state.status === "failed") throw new Error(state.error);
  }
  throw new Error("Processing timed out. Your local recording was kept.");
}
