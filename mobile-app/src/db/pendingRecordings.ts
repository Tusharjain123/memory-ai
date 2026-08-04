import * as FileSystem from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { getDatabase } from "./database";

export type PendingRecording = {
  id: string;
  recordingUri: string;
  createdAt: string;
  lastError: string | null;
};

export async function createPendingRecording(
  recordingUri: string,
): Promise<PendingRecording> {
  const database = await getDatabase();
  const item: PendingRecording = {
    id: randomUUID(),
    recordingUri,
    createdAt: new Date().toISOString(),
    lastError: null,
  };
  await database.runAsync(
    `INSERT INTO pending_recordings
     (id,recording_uri,created_at,last_error) VALUES (?,?,?,NULL)`,
    item.id, item.recordingUri, item.createdAt,
  );
  return item;
}

export async function listPendingRecordings(): Promise<PendingRecording[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    recording_uri: string;
    created_at: string;
    last_error: string | null;
  }>("SELECT * FROM pending_recordings ORDER BY created_at DESC");
  return rows.map((row) => ({
    id: row.id,
    recordingUri: row.recording_uri,
    createdAt: row.created_at,
    lastError: row.last_error,
  }));
}

export async function setPendingRecordingError(
  id: string,
  error: string,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE pending_recordings SET last_error=? WHERE id=?",
    error.slice(0, 1_000), id,
  );
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
