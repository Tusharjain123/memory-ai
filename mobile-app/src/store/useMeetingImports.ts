import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { create } from "zustand";
import { InsufficientBalanceError, SignInRequiredError } from "../services/apiFetch";
import type { GoogleMeeting } from "../contracts";
import { importedMeetings, importMeeting } from "../services/googleWorkspace";

type MeetingImportsState = {
  /** eventId → progress 0–100 while importing. */
  progress: Record<string, number>;
  /** eventId → local conversation id once imported. */
  imported: Record<string, string>;
  refreshImported: () => Promise<void>;
  start: (meeting: GoogleMeeting) => Promise<string | null>;
};

/** Meet imports shared by the Calendar drawer and the meeting screen, so progress survives navigation. */
export const useMeetingImports = create<MeetingImportsState>((set, get) => ({
  progress: {},
  imported: {},
  refreshImported: async () => {
    const map = await importedMeetings();
    set({ imported: Object.fromEntries(map) });
  },
  start: async (meeting) => {
    const { progress, imported } = get();
    if (progress[meeting.eventId] != null) return null;
    if (imported[meeting.eventId]) return imported[meeting.eventId]!;
    void Haptics.selectionAsync();
    const setProgress = (value: number) =>
      set((state) => ({ progress: { ...state.progress, [meeting.eventId]: value } }));
    setProgress(1);
    try {
      const conversationId = await importMeeting(meeting, { onProgress: setProgress });
      set((state) => {
        const { [meeting.eventId]: _done, ...rest } = state.progress;
        return { progress: rest, imported: { ...state.imported, [meeting.eventId]: conversationId } };
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return conversationId;
    } catch (cause) {
      set((state) => {
        const { [meeting.eventId]: _failed, ...rest } = state.progress;
        return { progress: rest };
      });
      if (cause instanceof InsufficientBalanceError || cause instanceof SignInRequiredError) {
        Alert.alert(
          cause instanceof InsufficientBalanceError ? "Not enough credit" : "Sign in to import",
          cause.message,
          [
            { text: "Not now", style: "cancel" },
            { text: cause instanceof InsufficientBalanceError ? "Top up" : "Sign in", onPress: () => router.push("/wallet" as never) },
          ],
        );
      } else {
        Alert.alert("Import failed", cause instanceof Error ? cause.message : "Please try again.");
      }
      return null;
    }
  },
}));
