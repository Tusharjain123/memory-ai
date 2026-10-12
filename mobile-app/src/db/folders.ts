import { randomUUID } from "expo-crypto";
import { getDatabase } from "./database";
import {
  shouldApplyRemote,
  uniqueFolderName,
  validateFolderName,
} from "../services/folderSyncMerge";

export type Folder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
};

export type FolderConversation = {
  id: string;
  title: string;
  summary: string;
  durationMs: number;
  createdAt: string;
};

export type FolderSyncRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FolderLinkSyncRow = {
  folder_id: string;
  conversation_id: string;
  added_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type Listener = () => void;
const listeners = new Set<Listener>();

/** Fires after any local folder change, so cloud sync can debounce a push. */
export function onFoldersChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyChanged(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Listener errors must not break local edits.
    }
  }
}

function friendlyNameError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : "";
  return /UNIQUE/i.test(message)
    ? new Error("You already have a folder with that name")
    : cause instanceof Error ? cause : new Error("Folder could not be saved");
}

export async function listFolders(): Promise<Folder[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string; name: string; created_at: string; updated_at: string; conversation_count: number;
  }>(
    `SELECT f.id, f.name, f.created_at, f.updated_at,
      (SELECT COUNT(*) FROM folder_recordings fr
        JOIN conversations c ON c.id = fr.conversation_id
        WHERE fr.folder_id = f.id AND fr.deleted_at IS NULL) conversation_count
     FROM folders f
     WHERE f.deleted_at IS NULL
     ORDER BY f.name COLLATE NOCASE`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    conversationCount: row.conversation_count,
  }));
}

export async function getFolder(id: string): Promise<Folder | null> {
  return (await listFolders()).find((folder) => folder.id === id) ?? null;
}

export async function createFolder(name: string): Promise<Folder> {
  const clean = validateFolderName(name);
  const database = await getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    await database.runAsync(
      "INSERT INTO folders (id, name, created_at, updated_at, dirty) VALUES (?, ?, ?, ?, 1)",
      id, clean, now, now,
    );
  } catch (cause) {
    throw friendlyNameError(cause);
  }
  notifyChanged();
  return { id, name: clean, createdAt: now, updatedAt: now, conversationCount: 0 };
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const clean = validateFolderName(name);
  const database = await getDatabase();
  try {
    await database.runAsync(
      "UPDATE folders SET name = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL",
      clean, new Date().toISOString(), id,
    );
  } catch (cause) {
    throw friendlyNameError(cause);
  }
  notifyChanged();
}

/** Soft delete so the deletion can reach the cloud copy; recordings are untouched. */
export async function deleteFolder(id: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "UPDATE folders SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?",
      now, now, id,
    );
    await database.runAsync(
      `UPDATE folder_recordings SET deleted_at = ?, updated_at = ?, dirty = 1
       WHERE folder_id = ? AND deleted_at IS NULL`,
      now, now, id,
    );
  });
  notifyChanged();
}

/** Only memories still on this device; links from other devices stay hidden. */
export async function listFolderConversations(folderId: string): Promise<FolderConversation[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string; title: string; summary: string; duration_ms: number; created_at: string;
  }>(
    `SELECT c.id, c.title, c.summary, c.duration_ms, c.created_at
     FROM folder_recordings fr
     JOIN conversations c ON c.id = fr.conversation_id
     WHERE fr.folder_id = ? AND fr.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    folderId,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }));
}

export async function getFolderIdsForConversation(conversationId: string): Promise<string[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ folder_id: string }>(
    `SELECT fr.folder_id FROM folder_recordings fr
     JOIN folders f ON f.id = fr.folder_id
     WHERE fr.conversation_id = ? AND fr.deleted_at IS NULL AND f.deleted_at IS NULL`,
    conversationId,
  );
  return rows.map((row) => row.folder_id);
}

/** Make the conversation's folder membership exactly `folderIds`. */
export async function setConversationFolders(
  conversationId: string,
  folderIds: string[],
): Promise<void> {
  const database = await getDatabase();
  const wanted = new Set(folderIds);
  const now = new Date().toISOString();
  const current = new Set(await getFolderIdsForConversation(conversationId));
  await database.withTransactionAsync(async () => {
    for (const folderId of wanted) {
      if (current.has(folderId)) continue;
      await database.runAsync(
        `INSERT INTO folder_recordings (folder_id, conversation_id, added_at, updated_at, deleted_at, dirty)
         VALUES (?, ?, ?, ?, NULL, 1)
         ON CONFLICT(folder_id, conversation_id) DO UPDATE SET
           deleted_at = NULL, added_at = excluded.added_at, updated_at = excluded.updated_at, dirty = 1`,
        folderId, conversationId, now, now,
      );
    }
    for (const folderId of current) {
      if (wanted.has(folderId)) continue;
      await database.runAsync(
        `UPDATE folder_recordings SET deleted_at = ?, updated_at = ?, dirty = 1
         WHERE folder_id = ? AND conversation_id = ?`,
        now, now, folderId, conversationId,
      );
    }
  });
  notifyChanged();
}

export async function removeConversationFromFolders(conversationId: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const result = await database.runAsync(
    `UPDATE folder_recordings SET deleted_at = ?, updated_at = ?, dirty = 1
     WHERE conversation_id = ? AND deleted_at IS NULL`,
    now, now, conversationId,
  );
  if (result.changes > 0) notifyChanged();
}

// ---- Sync helpers (used only by services/folderSync.ts) ----

export async function listDirtyFolders(): Promise<FolderSyncRow[]> {
  const database = await getDatabase();
  return database.getAllAsync<FolderSyncRow>(
    "SELECT id, name, created_at, updated_at, deleted_at FROM folders WHERE dirty = 1",
  );
}

export async function listDirtyFolderLinks(): Promise<FolderLinkSyncRow[]> {
  const database = await getDatabase();
  return database.getAllAsync<FolderLinkSyncRow>(
    `SELECT folder_id, conversation_id, added_at, updated_at, deleted_at
     FROM folder_recordings WHERE dirty = 1`,
  );
}

/** Clear dirty only if the row wasn't edited again while it was being pushed. */
export async function markFoldersClean(rows: FolderSyncRow[]): Promise<void> {
  const database = await getDatabase();
  for (const row of rows) {
    await database.runAsync(
      "UPDATE folders SET dirty = 0 WHERE id = ? AND updated_at = ?",
      row.id, row.updated_at,
    );
  }
}

export async function markFolderLinksClean(rows: FolderLinkSyncRow[]): Promise<void> {
  const database = await getDatabase();
  for (const row of rows) {
    await database.runAsync(
      `UPDATE folder_recordings SET dirty = 0
       WHERE folder_id = ? AND conversation_id = ? AND updated_at = ?`,
      row.folder_id, row.conversation_id, row.updated_at,
    );
  }
}

export async function markAllFoldersDirty(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    UPDATE folders SET dirty = 1;
    UPDATE folder_recordings SET dirty = 1;
  `);
}

/** Rename a local folder that clashes with a cloud name and queue it for push. */
export async function renameFolderForConflict(id: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ name: string }>("SELECT name FROM folders WHERE id = ?", id);
  if (!row) return;
  const taken = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM folders WHERE deleted_at IS NULL AND id <> ?", id,
  );
  const name = uniqueFolderName(`${row.name} (2)`, taken.map((item) => item.name));
  await database.runAsync(
    "UPDATE folders SET name = ?, updated_at = ?, dirty = 1 WHERE id = ?",
    name, new Date().toISOString(), id,
  );
}

export async function applyRemoteFolders(rows: FolderSyncRow[]): Promise<number> {
  const database = await getDatabase();
  let applied = 0;
  for (const remote of rows) {
    const local = await database.getFirstAsync<{ updated_at: string }>(
      "SELECT updated_at FROM folders WHERE id = ?", remote.id,
    );
    if (!shouldApplyRemote(local ? { updatedAt: local.updated_at } : null, { updatedAt: remote.updated_at })) {
      continue;
    }
    let name = remote.name;
    let dirty = 0;
    if (!remote.deleted_at) {
      const taken = await database.getAllAsync<{ name: string }>(
        "SELECT name FROM folders WHERE deleted_at IS NULL AND id <> ?", remote.id,
      );
      const unique = uniqueFolderName(name, taken.map((item) => item.name));
      if (unique !== name) {
        name = unique;
        dirty = 1;
      }
    }
    await database.runAsync(
      `INSERT INTO folders (id, name, created_at, updated_at, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at, dirty = excluded.dirty`,
      remote.id, name, remote.created_at, remote.updated_at, remote.deleted_at, dirty,
    );
    applied += 1;
  }
  if (applied) notifyChanged();
  return applied;
}

export async function applyRemoteFolderLinks(rows: FolderLinkSyncRow[]): Promise<number> {
  const database = await getDatabase();
  let applied = 0;
  for (const remote of rows) {
    const folder = await database.getFirstAsync<{ id: string }>(
      "SELECT id FROM folders WHERE id = ?", remote.folder_id,
    );
    if (!folder) continue;
    const local = await database.getFirstAsync<{ updated_at: string }>(
      "SELECT updated_at FROM folder_recordings WHERE folder_id = ? AND conversation_id = ?",
      remote.folder_id, remote.conversation_id,
    );
    if (!shouldApplyRemote(local ? { updatedAt: local.updated_at } : null, { updatedAt: remote.updated_at })) {
      continue;
    }
    await database.runAsync(
      `INSERT INTO folder_recordings (folder_id, conversation_id, added_at, updated_at, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(folder_id, conversation_id) DO UPDATE SET added_at = excluded.added_at,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, dirty = 0`,
      remote.folder_id, remote.conversation_id, remote.added_at, remote.updated_at, remote.deleted_at,
    );
    applied += 1;
  }
  if (applied) notifyChanged();
  return applied;
}

/** Drop tombstones the cloud already has. */
export async function purgeSyncedTombstones(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM folder_recordings WHERE deleted_at IS NOT NULL AND dirty = 0;
    DELETE FROM folders WHERE deleted_at IS NOT NULL AND dirty = 0
      AND NOT EXISTS (SELECT 1 FROM folder_recordings fr WHERE fr.folder_id = folders.id);
  `);
}

/** Without cloud sync there is no one to tell about deletions; drop them now. */
export async function purgeAllTombstones(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM folder_recordings WHERE deleted_at IS NOT NULL;
    DELETE FROM folders WHERE deleted_at IS NOT NULL;
  `);
}

export async function getSyncState(key: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM sync_state WHERE key = ?", key,
  );
  return row?.value ?? null;
}

export async function setSyncState(key: string, value: string | null): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key, value,
  );
}
