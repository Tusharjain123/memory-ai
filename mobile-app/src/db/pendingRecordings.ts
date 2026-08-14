import * as FileSystem from "expo-file-system/legacy";
import { randomUUID } from "expo-crypto";
import { getDatabase } from "./database";

export type PendingRecording = {
  id: string;
  recordingUri: string;
  createdAt: string;
  lastError: string | null;
  uploadId: string | null;
  uploadPartIndex: number | null;
  processingJobId: string | null;
  durationMs: number | null;
};

type PendingRow = {
  id: string;
  recording_uri: string;
  created_at: string;
  last_error: string | null;
  upload_id: string | null;
  upload_part_index: number | null;
  processing_job_id: string | null;
  duration_ms: number | null;
};

function mapRow(row: PendingRow): PendingRecording {
  return {
    id: row.id,
    recordingUri: row.recording_uri,
    createdAt: row.created_at,
    lastError: row.last_error,
    uploadId: row.upload_id,
    uploadPartIndex: row.upload_part_index,
    processingJobId: row.processing_job_id,
    durationMs: row.duration_ms,
  };
}

export async function createPendingRecording(
  recordingUri: string,
  durationMs?: number,
): Promise<PendingRecording> {
  const database = await getDatabase();
  const item: PendingRecording = {
    id: randomUUID(),
    recordingUri,
    createdAt: new Date().toISOString(),
    lastError: null,
    uploadId: null,
    uploadPartIndex: null,
    processingJobId: null,
    durationMs: durationMs ?? null,
  };
  await database.runAsync(
    `INSERT INTO pending_recordings
     (id,recording_uri,created_at,last_error,upload_id,upload_part_index,processing_job_id,duration_ms)
     VALUES (?,?,?,NULL,NULL,NULL,NULL,?)`,
    item.id,
    item.recordingUri,
    item.createdAt,
    item.durationMs,
  );
  return item;
}

export async function listPendingRecordings(): Promise<PendingRecording[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PendingRow>(
    "SELECT * FROM pending_recordings ORDER BY created_at DESC",
  );
  return rows.map(mapRow);
}

export async function getPendingRecording(id: string): Promise<PendingRecording | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<PendingRow>(
    "SELECT * FROM pending_recordings WHERE id=?",
    id,
  );
  return row ? mapRow(row) : null;
}

export async function updatePendingUploadState(
  id: string,
  update: {
    uploadId?: string | null;
    uploadPartIndex?: number | null;
    processingJobId?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  const database = await getDatabase();
  const current = await getPendingRecording(id);
  if (!current) return;
  await database.runAsync(
    `UPDATE pending_recordings
     SET upload_id=?, upload_part_index=?, processing_job_id=?, last_error=?
     WHERE id=?`,
    update.uploadId !== undefined ? update.uploadId : current.uploadId,
    update.uploadPartIndex !== undefined ? update.uploadPartIndex : current.uploadPartIndex,
    update.processingJobId !== undefined ? update.processingJobId : current.processingJobId,
    update.lastError !== undefined ? update.lastError?.slice(0, 1_000) ?? null : current.lastError,
    id,
  );
}

export async function setPendingRecordingError(
  id: string,
  error: string,
): Promise<void> {
  await updatePendingUploadState(id, { lastError: error });
}

export async function deletePendingRecording(id: string): Promise<void> {
  const database = await getDatabase();
  const item = await database.getFirstAsync<{ recording_uri: string }>(
    "SELECT recording_uri FROM pending_recordings WHERE id=?", id,
  );
  await database.runAsync("DELETE FROM pending_recordings WHERE id=?", id);
  if (item?.recording_uri) {
    await FileSystem.deleteAsync(item.recording_uri, { idempotent: true });
  }
}
