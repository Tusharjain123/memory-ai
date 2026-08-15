import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL } from "../config/api";

export type FeedbackCategory = "bug" | "suggestion" | "transcription" | "experience" | "other";

export type FeedbackSubmission = {
  category: FeedbackCategory;
  message: string;
  rating: number | null;
  email: string | null;
};

export async function submitFeedback(input: FeedbackSubmission): Promise<void> {
  const response = await fetch(`${API_URL}/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      appVersion: Constants.expoConfig?.version ?? null,
      platform: Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "web"
        ? Platform.OS
        : "unknown",
      platformVersion: String(Platform.Version),
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Could not send feedback (${response.status})`);
  }
}
