import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  deletePendingRecording,
  listPendingRecordings,
  type PendingRecording,
} from "../src/db/pendingRecordings";
import { RecordingPlayer } from "../src/components/RecordingPlayer";
import { useClipPlayer } from "../src/hooks/useClipPlayer";
import {
  ensureProcessing,
  getProcessingSnapshot,
  isProcessingPending,
  subscribeProcessing,
  type ProcessingJobSnapshot,
} from "../src/services/processingOrchestrator";
import { relativeDate } from "../src/utils/format";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

export default function PendingRecordingsScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [items, setItems] = useState<PendingRecording[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, ProcessingJobSnapshot>>({});
  const [listenId, setListenId] = useState<string | null>(null);
  const listening = items.find((item) => item.id === listenId);
  const player = useClipPlayer(listening?.recordingUri);

  const load = useCallback(async () => setItems(await listPendingRecordings()), []);

  useEffect(() => {
    let active = true;
    return subscribeProcessing((snapshot) => {
      if (!active) return;
      setSnapshots((current) => ({ ...current, [snapshot.pendingId]: snapshot }));
      if (snapshot.status === "complete" && snapshot.conversationId) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void load();
        router.replace(`/review/${snapshot.conversationId}` as never);
      }
      if (snapshot.status === "failed") {
        void load();
      }
    });
  }, [load, router]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function resume(item: PendingRecording): Promise<void> {
    if (isProcessingPending(item.id)) return;
    void Haptics.selectionAsync();
    try {
      await ensureProcessing(item.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Processing is unavailable";
      await load();
      Alert.alert(
        "Still safely saved",
        `${message}\n\nYour audio is safe on this device. Try again when your connection and backend are available.`,
      );
    }
  }

  function confirmRemove(item: PendingRecording): void {
    Alert.alert("Remove this recording?", "The unprocessed audio will be permanently deleted from this device.", [
      { text: "Keep it", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        if (listenId === item.id) {
          player.stop();
          setListenId(null);
        }
        void deletePendingRecording(item.id).then(load);
      } },
    ]);
  }

  const anyRunning = items.some((item) => isProcessingPending(item.id)
    || snapshots[item.id]?.status === "running"
    || getProcessingSnapshot(item.id)?.status === "running");

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
            <Text style={[styles.intro, { color: colors.muted }]}>
              Transcription keeps running while Memory is open. You can leave this screen. If the app was closed, reopen it to finish.
            </Text>
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
          const snapshot = snapshots[item.id] ?? getProcessingSnapshot(item.id);
          const isProcessing = isProcessingPending(item.id) || snapshot?.status === "running";
          const progress = snapshot?.progress;
          const statusLabel = isProcessing && progress != null
            ? ` · ${progress}%`
            : isProcessing
              ? " · Transcribing"
              : item.processingJobId
                ? " · Queued"
                : item.uploadId
                  ? " · Upload paused"
                  : " · Waiting securely";
          return (
            <View style={[styles.card, { backgroundColor: colors.surface }, !isDark && shadows.card, index > 0 && { marginTop: spacing.sm }]}>
              <View style={styles.cardTop}>
                <View style={[styles.audioIcon, { backgroundColor: colors.sageSoft }]}>
                  <Ionicons name="mic-outline" size={22} color={colors.sage} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={[styles.title, { color: colors.ink }]}>Saved recording</Text>
                  <Text style={[styles.date, { color: colors.muted }]}>
                    {relativeDate(item.createdAt)}
                    {statusLabel}
                  </Text>
                </View>
                <Ionicons name="lock-closed" size={16} color={colors.sage} />
              </View>
              {item.lastError || snapshot?.error ? (
                <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
                  <Ionicons name="information-circle-outline" size={17} color={colors.muted} />
                  <Text numberOfLines={2} style={[styles.noteText, { color: colors.muted }]}>Last attempt didn’t finish. Your audio was kept.</Text>
                </View>
              ) : null}
              {listenId === item.id ? (
                <View style={styles.player}>
                  <RecordingPlayer
                    player={player}
                    fallbackDurationMs={item.durationMs}
                    autoPlay
                  />
                </View>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isProcessing}
                  onPress={() => void resume(item)}
                  style={({ pressed }) => [styles.retry, { backgroundColor: colors.ink }, pressed && { opacity: 0.78 }]}
                >
                  {isProcessing ? <Ionicons name="sync" size={18} color={colors.background} /> : <Ionicons name="arrow-forward" size={17} color={colors.background} />}
                  <Text style={[styles.retryText, { color: colors.background }]}>{isProcessing ? "Processing…" : "Continue"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={listenId === item.id ? "Hide recording player" : "Listen to saved recording"}
                  onPress={() => {
                    if (listenId === item.id) {
                      player.stop();
                      setListenId(null);
                      return;
                    }
                    player.stop();
                    setListenId(item.id);
                  }}
                  style={({ pressed }) => [styles.listen, { borderColor: colors.line }, pressed && { opacity: 0.55 }]}
                >
                  <Ionicons name={listenId === item.id && player.playing ? "pause" : "headset-outline"} size={17} color={colors.ink} />
                  <Text style={[styles.listenText, { color: colors.ink }]}>{listenId === item.id ? "Hide" : "Listen"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={anyRunning && isProcessing}
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
  player: { marginTop: spacing.md },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  retry: { flex: 1, minHeight: 50, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  retryText: { fontSize: 14, fontWeight: "800" },
  listen: { minHeight: 50, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: spacing.sm },
  listenText: { fontSize: 14, fontWeight: "800" },
  remove: { minWidth: 72, minHeight: 50, alignItems: "center", justifyContent: "center" },
  removeText: { fontSize: 14, fontWeight: "700" },
});
