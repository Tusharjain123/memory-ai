import * as FileSystem from "expo-file-system/legacy";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import type { ConversationDetail } from "../db/conversations";
import { getDatabase } from "../db/database";

const LOCK_KEY = "memory-ai.biometric-lock";

export async function isBiometricLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(LOCK_KEY)) === "enabled";
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hardware || !enrolled) throw new Error("No biometric authentication is enrolled");
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm biometric lock",
      cancelLabel: "Cancel",
    });
    if (!result.success) throw new Error("Authentication was cancelled");
  }
  await SecureStore.setItemAsync(LOCK_KEY, enabled ? "enabled" : "disabled");
}

export async function authenticateApp(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Memory AI",
    cancelLabel: "Keep locked",
    disableDeviceFallback: false,
  });
  return result.success;
}

export async function deleteAllData(): Promise<void> {
  const database = await getDatabase();
  const recordings = await database.getAllAsync<{ recording_uri: string | null }>(
    "SELECT recording_uri FROM conversations",
  );
  await database.execAsync(`
    DELETE FROM conversations;
    DELETE FROM people;
    DELETE FROM pending_recordings;
    DELETE FROM user_profile;
    DELETE FROM sqlite_sequence WHERE name='embeddings';
  `);
  await Promise.all(
    recordings
      .flatMap((item) => (item.recording_uri ? [item.recording_uri] : []))
      .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true })),
  );
  if (FileSystem.documentDirectory) {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}recordings/`, {
      idempotent: true,
    });
  }
}

export async function exportConversation(item: ConversationDetail): Promise<void> {
  const speakerHeading = (segment: ConversationDetail["segments"][number]) =>
    segment.speakerName
      ? `${segment.speakerName} (${segment.speakerLabel})`
      : segment.speakerLabel;
  const markdown = [
    `# ${item.title}`,
    "",
    `Recorded: ${new Date(item.createdAt).toLocaleString()}`,
    `Language: ${item.language}`,
    "",
    "## Main goal",
    "",
    item.mainGoal,
    "",
    "## Summary",
    "",
    item.summary,
    "",
    "## Topics",
    "",
    item.topics.map((topic) => `- ${topic}`).join("\n"),
    "",
    "## Participants",
    "",
    item.participants.map((person) => {
      const details = [
        person.speakerLabel,
        person.relationship,
        person.email,
        person.phone,
      ].filter(Boolean).join(" · ");
      return `- ${person.name}${details ? ` (${details})` : ""}${person.notes ? ` — ${person.notes}` : ""}`;
    }).join("\n"),
    "",
    "## Decisions",
    "",
    item.decisions.map((decision) => {
      const evidence = decision.quote
        ? ` — “${decision.quote}”${decision.startMs != null ? ` @ ${Math.floor(decision.startMs / 1000)}s` : ""}`
        : "";
      return `- ${decision.text}${evidence}`;
    }).join("\n"),
    "",
    "## Commitments",
    "",
    item.commitments
      .map((commitment) => {
        const evidence = commitment.quote
          ? ` — “${commitment.quote}”`
          : "";
        return `- [${commitment.status === "completed" ? "x" : " "}] (${commitment.direction}) ${commitment.text}${commitment.ownerName ? ` — ${commitment.ownerName}` : ""}${commitment.dueAt ? ` (${commitment.dueAt})` : ""}${evidence}`;
      })
      .join("\n"),
    "",
    "## Original transcript",
    "",
    item.segments.map((segment) => `**${speakerHeading(segment)}:** ${segment.rawText}`).join("\n\n"),
    "",
    "## Clean transcript",
    "",
    item.segments.map((segment) => `**${speakerHeading(segment)}:** ${segment.cleanText}`).join("\n\n"),
    "",
    "## Roman Hinglish transcript",
    "",
    item.segments.map((segment) => `**${speakerHeading(segment)}:** ${segment.romanHinglishText}`).join("\n\n"),
  ].join("\n");
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("Export storage is unavailable");
  const safeName = item.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 50) || "conversation";
  const uri = `${directory}${safeName}.md`;
  await FileSystem.writeAsStringAsync(uri, markdown);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable");
  await Sharing.shareAsync(uri, { mimeType: "text/markdown", dialogTitle: "Export conversation" });
}
