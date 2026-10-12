import { AppState } from "react-native";
import {
  applyRemoteFolderLinks,
  applyRemoteFolders,
  getSyncState,
  listDirtyFolderLinks,
  listDirtyFolders,
  markAllFoldersDirty,
  markFolderLinksClean,
  markFoldersClean,
  onFoldersChanged,
  purgeSyncedTombstones,
  renameFolderForConflict,
  setSyncState,
  type FolderLinkSyncRow,
  type FolderSyncRow,
} from "../db/folders";
import { useAuthStore } from "../store/useAuthStore";
import { isUniqueViolation, nextCursor } from "./folderSyncMerge";
import { fetchCloudSyncEnabled } from "./profileSync";
import { getSupabase } from "./supabase";

const ACCOUNT_KEY = "folders.account_id";
const FOLDER_CURSOR_KEY = "folders.cursor";
const LINK_CURSOR_KEY = "folder_links.cursor";
const PULL_PAGE = 500;
const DEBOUNCE_MS = 2_000;

export type FolderSyncResult = { status: "skipped" | "off" | "synced"; pushed: number; pulled: number };

let inFlight: Promise<FolderSyncResult> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function resetFolderSyncCursors(): Promise<void> {
  await setSyncState(FOLDER_CURSOR_KEY, null);
  await setSyncState(LINK_CURSOR_KEY, null);
}

/** Push dirty folders/links, then pull newer cloud rows. Runs only when opted in. */
export function syncFolders(): Promise<FolderSyncResult> {
  inFlight ??= runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<FolderSyncResult> {
  const supabase = getSupabase();
  const { userId, status, patch } = useAuthStore.getState();
  if (!supabase || status !== "signedIn" || !userId) return { status: "skipped", pushed: 0, pulled: 0 };
  // The flag is re-read from the server before every push.
  if (!(await fetchCloudSyncEnabled())) return { status: "off", pushed: 0, pulled: 0 };

  patch({ syncing: true, syncError: null });
  try {
    if ((await getSyncState(ACCOUNT_KEY)) !== userId) {
      await resetFolderSyncCursors();
      await markAllFoldersDirty();
      await setSyncState(ACCOUNT_KEY, userId);
    }
    const pushed = (await pushFolders(userId)) + (await pushLinks(userId));
    const pulled = await pull();
    await purgeSyncedTombstones();
    patch({ lastSyncedAt: new Date().toISOString() });
    return { status: "synced", pushed, pulled };
  } catch (cause) {
    patch({ syncError: cause instanceof Error ? cause.message : "Sync failed" });
    throw cause;
  } finally {
    patch({ syncing: false });
  }
}

async function pushFolders(userId: string): Promise<number> {
  const supabase = getSupabase()!;
  const rows = await listDirtyFolders();
  if (!rows.length) return 0;
  const toRemote = (row: FolderSyncRow) => ({ ...row, user_id: userId });
  const { error } = await supabase.from("folders").upsert(rows.map(toRemote), { onConflict: "id" });
  if (!error) {
    await markFoldersClean(rows);
    return rows.length;
  }
  if (!isUniqueViolation(error)) throw new Error(error.message);
  // Another device already has a live folder with one of these names: go row by row.
  let pushed = 0;
  for (const row of rows) {
    let attempt = row;
    for (let tries = 0; tries < 3; tries += 1) {
      const result = await supabase.from("folders").upsert(toRemote(attempt), { onConflict: "id" });
      if (!result.error) {
        await markFoldersClean([attempt]);
        pushed += 1;
        break;
      }
      if (!isUniqueViolation(result.error)) throw new Error(result.error.message);
      await renameFolderForConflict(row.id);
      attempt = (await listDirtyFolders()).find((item) => item.id === row.id) ?? attempt;
    }
  }
  return pushed;
}

async function pushLinks(userId: string): Promise<number> {
  const supabase = getSupabase()!;
  const rows = await listDirtyFolderLinks();
  if (!rows.length) return 0;
  const toRemote = (row: FolderLinkSyncRow) => ({ ...row, user_id: userId });
  const { error } = await supabase
    .from("folder_recordings")
    .upsert(rows.map(toRemote), { onConflict: "folder_id,conversation_id" });
  if (!error) {
    await markFolderLinksClean(rows);
    return rows.length;
  }
  // A link whose folder didn't make it up yet fails the FK; push the rest.
  let pushed = 0;
  for (const row of rows) {
    const result = await supabase
      .from("folder_recordings")
      .upsert(toRemote(row), { onConflict: "folder_id,conversation_id" });
    if (!result.error) {
      await markFolderLinksClean([row]);
      pushed += 1;
    }
  }
  return pushed;
}

async function pull(): Promise<number> {
  const supabase = getSupabase()!;
  let pulled = 0;

  let folderCursor = await getSyncState(FOLDER_CURSOR_KEY);
  for (;;) {
    let query = supabase
      .from("folders")
      .select("id,name,created_at,updated_at,deleted_at,server_updated_at")
      .order("server_updated_at", { ascending: true })
      .limit(PULL_PAGE);
    if (folderCursor) query = query.gt("server_updated_at", folderCursor);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<FolderSyncRow & { server_updated_at: string }>;
    pulled += await applyRemoteFolders(rows);
    folderCursor = nextCursor(folderCursor, rows);
    await setSyncState(FOLDER_CURSOR_KEY, folderCursor);
    if (rows.length < PULL_PAGE) break;
  }

  let linkCursor = await getSyncState(LINK_CURSOR_KEY);
  for (;;) {
    let query = supabase
      .from("folder_recordings")
      .select("folder_id,conversation_id,added_at,updated_at,deleted_at,server_updated_at")
      .order("server_updated_at", { ascending: true })
      .limit(PULL_PAGE);
    if (linkCursor) query = query.gt("server_updated_at", linkCursor);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<FolderLinkSyncRow & { server_updated_at: string }>;
    pulled += await applyRemoteFolderLinks(rows);
    linkCursor = nextCursor(linkCursor, rows);
    await setSyncState(LINK_CURSOR_KEY, linkCursor);
    if (rows.length < PULL_PAGE) break;
  }
  return pulled;
}

export function scheduleFolderSync(delayMs = DEBOUNCE_MS): void {
  const { status, cloudSyncEnabled } = useAuthStore.getState();
  if (status !== "signedIn" || !cloudSyncEnabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncFolders().catch(() => {
      // Error is kept in the auth store for the Cloud screen.
    });
  }, delayMs);
}

/** Debounced push after folder edits and on app foreground. */
export function bindFolderSync(): () => void {
  const unsubscribe = onFoldersChanged(() => scheduleFolderSync());
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") scheduleFolderSync(0);
  });
  return () => {
    unsubscribe();
    subscription.remove();
  };
}
