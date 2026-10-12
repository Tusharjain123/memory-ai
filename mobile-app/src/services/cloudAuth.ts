import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import type { Session } from "@supabase/supabase-js";
import { markAllFoldersDirty, purgeAllTombstones } from "../db/folders";
import { useAuthStore } from "../store/useAuthStore";
import { authorizedFetch } from "./apiFetch";
import { resetFolderSyncCursors, syncFolders } from "./folderSync";
import { fetchCloudSyncEnabled, fillLocalProfileFromGoogle, pushProfileToCloud } from "./profileSync";
import { disconnectCalendar, refreshCalendarStatus } from "./googleWorkspace";
import { configureGoogle } from "./googleSignin";
import { getSupabase } from "./supabase";
import { useWalletStore } from "../store/useWalletStore";

let hydrated = false;

function applySession(session: Session | null): void {
  const { patch } = useAuthStore.getState();
  if (!session) {
    patch({
      status: "signedOut",
      userId: null,
      email: null,
      cloudSyncEnabled: false,
      calendarStatus: "disconnected",
      calendarEmail: null,
    });
    useWalletStore.getState().clear();
    return;
  }
  patch({ status: "signedIn", userId: session.user.id, email: session.user.email ?? null });
  void fetchCloudSyncEnabled().catch(() => {
    // Offline: keep the cached flag; the next push re-checks it.
  });
  void refreshCalendarStatus().catch(() => {
    // Offline: the meetings screen re-checks.
  });
  void useWalletStore.getState().refresh();
}

/** Read any saved session. Never blocks or gates the app. */
export async function hydrateCloudAccount(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const supabase = getSupabase();
  if (!supabase) {
    useAuthStore.getState().patch({ status: "unavailable" });
    return;
  }
  const { data } = await supabase.auth.getSession();
  applySession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => applySession(session));
}

/** Optional Google sign-in. Returns false if the user cancelled. */
export async function connectGoogle(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud features aren't available in this build");
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return false;
    const idToken = response.data.idToken;
    if (!idToken) throw new Error("Google didn't return a sign-in token");
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
    if (error) throw new Error(error.message);
    applySession(data.session);
    await fillLocalProfileFromGoogle(response.data.user.name, response.data.user.email);
    return true;
  } catch (cause) {
    if (isErrorWithCode(cause) && cause.code === statusCodes.IN_PROGRESS) return false;
    // Android code 10: no Android OAuth client matches this package + signing SHA-1.
    if (isErrorWithCode(cause) && (cause.code === "10" || /DEVELOPER_ERROR/.test(cause.message))) {
      throw new Error("Google sign-in isn't set up for this app build yet. Add an Android OAuth client with this app's package name and SHA-1 in Google Cloud.");
    }
    throw cause instanceof Error ? cause : new Error("Google sign-in failed");
  }
}

/** Sign out of the cloud account. Everything on this device stays. */
export async function disconnectGoogle(): Promise<void> {
  const supabase = getSupabase();
  // Revoke Calendar & Meet access too; best effort, the account sign-out still happens.
  if (useAuthStore.getState().calendarStatus !== "disconnected") {
    await disconnectCalendar().catch(() => undefined);
  }
  configureGoogle();
  await GoogleSignin.signOut().catch(() => undefined);
  await supabase?.auth.signOut({ scope: "local" });
  applySession(null);
}

/** The user's choice to store data in the cloud. */
export async function enableCloudStorage(): Promise<void> {
  const supabase = getSupabase();
  const { userId, patch } = useAuthStore.getState();
  if (!supabase || !userId) throw new Error("Connect Google first");
  const { error } = await supabase.from("users").update({ cloud_sync_enabled: true }).eq("id", userId);
  if (error) throw new Error(error.message);
  patch({ cloudSyncEnabled: true });
  await pushProfileToCloud();
  await markAllFoldersDirty();
  await syncFolders();
}

/**
 * Stop storing data in the cloud. With deleteCloudCopy the synced folders and
 * profile details are removed from Supabase; local data is never touched.
 */
export async function disableCloudStorage(options: { deleteCloudCopy: boolean }): Promise<void> {
  const supabase = getSupabase();
  const { userId, patch } = useAuthStore.getState();
  if (!supabase || !userId) throw new Error("Connect Google first");
  if (options.deleteCloudCopy) {
    const response = await authorizedFetch("/v1/me/cloud-data", { method: "DELETE" });
    if (!response.ok) throw new Error(`Could not delete the cloud copy (${response.status})`);
    await resetFolderSyncCursors();
    await purgeAllTombstones();
  } else {
    const { error } = await supabase.from("users").update({ cloud_sync_enabled: false }).eq("id", userId);
    if (error) throw new Error(error.message);
  }
  patch({ cloudSyncEnabled: false });
}
