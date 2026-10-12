import { create } from "zustand";

/** unavailable = this build has no cloud config; the app runs fully on-device. */
export type CloudStatus = "unavailable" | "loading" | "signedOut" | "signedIn";

/** Google Calendar + Meet access, separate from the sign-in itself. */
export type CalendarStatus = "unknown" | "disconnected" | "connected" | "expired";

type AuthState = {
  status: CloudStatus;
  userId: string | null;
  email: string | null;
  /** Mirrors users.cloud_sync_enabled; the server copy is re-checked before every push. */
  cloudSyncEnabled: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  calendarStatus: CalendarStatus;
  calendarEmail: string | null;
  patch: (update: Partial<Omit<AuthState, "patch">>) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  userId: null,
  email: null,
  cloudSyncEnabled: false,
  syncing: false,
  lastSyncedAt: null,
  syncError: null,
  calendarStatus: "unknown",
  calendarEmail: null,
  patch: (update) => set(update),
}));
