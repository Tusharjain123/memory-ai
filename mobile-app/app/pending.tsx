import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  deletePendingRecording,
  listPendingRecordings,
  setPendingRecordingError,
  type PendingRecording,
} from "../src/db/pendingRecordings";
import { saveConversation } from "../src/db/conversations";
import { processRecording } from "../src/services/processing";
import { relativeDate } from "../src/utils/format";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

export default function PendingRecordingsScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [items, setItems] = useState<PendingRecording[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await listPendingRecordings()), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function retry(item: PendingRecording): Promise<void> {
    if (processingId) return;
    void Haptics.selectionAsync();
    setProcessingId(item.id);
    try {
      const result = await processRecording(item.recordingUri);
      const conversationId = await saveConversation(result, item.recordingUri, item.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/conversation/${conversationId}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Processing is unavailable";
      await setPendingRecordingError(item.id, message);
      await load();
      Alert.alert(
        "Still safely saved",
        `${message}\n\nYour audio is safe on this device. Try again when your connection and backend are available.`,
      );
    } finally {
      setProcessingId(null);
    }
  }

  function confirmRemove(item: PendingRecording): void {
    Alert.alert("Remove this recording?", "The unprocessed audio will be permanently deleted from this device.", [
      { text: "Keep it", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void deletePendingRecording(item.id).then(load) },
    ]);
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, !items.length && styles.emptyList]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>Continue processing</Text>
            <Text style={[styles.intro, { color: colors.muted }]}>These recordings are safe on your device. Continue whenever you’re online and the backend is ready.</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyVisual} accessibilityLabel="No recordings are waiting to process">
            <Image
              source={isDark
                ? require("../assets/empty-saved-recordings-dark.png")
                : require("../assets/empty-saved-recordings.png")}
              resizeMode="contain"
              style={styles.emptyImage}
            />
          </View>
        }
        renderItem={({ item, index }) => {
          const isProcessing = processingId === item.id;
          return (
            <View style={[styles.card, { backgroundColor: colors.surface }, !isDark && shadows.card, index > 0 && { marginTop: spacing.sm }]}>
              <View style={styles.cardTop}>
                <View style={[styles.audioIcon, { backgroundColor: colors.sageSoft }]}>
                  <Ionicons name="mic-outline" size={22} color={colors.sage} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={[styles.title, { color: colors.ink }]}>Saved recording</Text>
                  <Text style={[styles.date, { color: colors.muted }]}>{relativeDate(item.createdAt)} · Waiting securely</Text>
                </View>
                <Ionicons name="lock-closed" size={16} color={colors.sage} />
              </View>
              {item.lastError ? (
                <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
                  <Ionicons name="information-circle-outline" size={17} color={colors.muted} />
                  <Text numberOfLines={2} style={[styles.noteText, { color: colors.muted }]}>Last attempt didn’t finish. Your audio was kept.</Text>
                </View>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={processingId !== null}
                  onPress={() => void retry(item)}
                  style={({ pressed }) => [styles.retry, { backgroundColor: colors.ink }, pressed && { opacity: 0.78 }]}
                >
                  {isProcessing ? <Ionicons name="sync" size={18} color={colors.background} /> : <Ionicons name="play" size={17} color={colors.background} />}
                  <Text style={[styles.retryText, { color: colors.background }]}>{isProcessing ? "Processing…" : "Continue"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={processingId !== null}
                  onPress={() => confirmRemove(item)}
                  style={({ pressed }) => [styles.remove, pressed && { opacity: 0.55 }]}
                >
                  <Text style={[styles.removeText, { color: colors.muted }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  emptyList: { flexGrow: 1 },
  header: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1 },
  intro: { fontSize: typeScale.body, lineHeight: 22, marginTop: spacing.xs, marginBottom: spacing.md },
  emptyVisual: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: spacing.lg },
  emptyImage: { width: 310, height: 310, borderRadius: radii.xl },
  card: { borderRadius: radii.lg, padding: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  audioIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1 },
  title: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  date: { fontSize: typeScale.caption, marginTop: 3 },
  note: { borderRadius: radii.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.sm, marginTop: spacing.md },
  noteText: { flex: 1, fontSize: typeScale.caption, lineHeight: 17 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  retry: { flex: 1, minHeight: 50, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  retryText: { fontSize: 14, fontWeight: "800" },
  remove: { minWidth: 80, minHeight: 50, alignItems: "center", justifyContent: "center" },
  removeText: { fontSize: 14, fontWeight: "700" },
});
