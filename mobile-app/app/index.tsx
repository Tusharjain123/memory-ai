import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import { Image, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { listConversations, type ConversationListItem } from "../src/db/conversations";
import { listPendingRecordings } from "../src/db/pendingRecordings";
import { countOpenCommitments, countPendingReviews, listPendingReviewConversations } from "../src/db/commitments";
import { MemoryListSkeleton } from "../src/components/ui";
import { formatDuration, greeting, relativeDate } from "../src/utils/format";
import { radii, shadows, spacing, type AppColors, typeScale, useAppTheme } from "../src/theme";

function ActionTile({ icon, title, body, large = false, onPress, colors }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; body?: string; large?: boolean;
  onPress: () => void; colors: AppColors;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => [styles.actionTile, large && styles.actionTileLarge,
        { backgroundColor: colors.surface, borderColor: colors.line }, pressed && styles.pressed]}>
      <View style={[styles.tileIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={large ? 24 : 20} color={colors.accent} />
      </View>
      <Text style={[large ? styles.largeTileTitle : styles.tileTitle, { color: colors.ink }]}>{title}</Text>
      {body ? <Text style={[styles.tileBody, { color: colors.muted }]}>{body}</Text> : null}
      {large ? (
        <View style={[styles.tileButton, { backgroundColor: colors.accent }]}>
          <Text style={styles.tileButtonText}>Begin</Text>
        </View>
      ) : <Ionicons name="arrow-forward" size={20} color={colors.accent} style={styles.tileArrow} />}
    </Pressable>
  );
}

function MemoryCard({ item, colors, onPress }: { item: ConversationListItem; colors: AppColors; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      accessibilityLabel={`${item.title}. ${relativeDate(item.createdAt)}. ${item.summary}`}
      style={({ pressed }) => [styles.memoryCard, { backgroundColor: colors.surface, borderColor: colors.line }, pressed && styles.pressed]}>
      <Text style={[styles.memoryDate, { color: colors.muted }]}>{relativeDate(item.createdAt)} · {formatDuration(item.durationMs)}</Text>
      <Text numberOfLines={1} style={[styles.memoryTitle, { color: colors.ink }]}>{item.title}</Text>
      <Text numberOfLines={2} style={[styles.memorySummary, { color: colors.muted }]}>{item.summary}</Text>
      <View style={styles.memoryBottom}>
        <Text style={[styles.memorySignals, { color: colors.faint }]}>{item.people.length} people · {item.commitmentCount ?? item.actionItemCount} commitments</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </View>
    </Pressable>
  );
}

function RecentHeading({ colors }: { colors: AppColors }) {
  return (
    <View style={styles.recentHeading}>
      <Text accessibilityRole="header" style={[styles.recentTitle, { color: colors.ink }]}>Your recent recordings</Text>
      <View style={[styles.headingLine, { backgroundColor: colors.line }]} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const [question, setQuestion] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [openCommitments, setOpenCommitments] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewInbox, setReviewInbox] = useState<Array<{ conversationId: string; title: string; pendingCount: number }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [conversations, pending, commitments, reviews, inbox] = await Promise.all([
      listConversations(),
      listPendingRecordings(),
      countOpenCommitments(),
      countPendingReviews(),
      listPendingReviewConversations(),
    ]);
    setItems(conversations);
    setPendingCount(pending.length);
    setOpenCommitments(commitments);
    setReviewCount(reviews);
    setReviewInbox(inbox.slice(0, 3));
    setLoaded(true);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function record() { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/record"); }
  function ask(): void {
    const clean = question.trim();
    if (!clean) return;
    void Haptics.selectionAsync();
    Keyboard.dismiss();
    setQuestion("");
    router.push({
      pathname: "/search",
      params: { question: clean, autoSubmit: "1" },
    } as never);
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      {!isDark ? <Image source={require("../assets/ambient-memory-bg.png")} resizeMode="cover" style={styles.ambientBackground} /> : null}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About Memory AI"
            onPress={() => router.push("/about")}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Image
              source={require("../assets/memory-ai-logo.png")}
              resizeMode="cover"
              style={[styles.brandLogo, { borderColor: colors.line }]}
            />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={() => router.push("/account")}
            style={[styles.settings, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Ionicons name="settings-outline" size={22} color={colors.accent} />
          </Pressable>
        </View>

        <Text style={[styles.eyebrow, { color: colors.accent }]}>{greeting()}</Text>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>Ready to remember something?</Text>

        <View style={styles.actionsGrid}>
          <ActionTile large icon="mic-outline" title="Record a conversation" body="Memory will capture the important moments for you." onPress={record} colors={colors} />
          <View style={styles.smallActions}>
            <ActionTile icon="sparkles-outline" title="Ask Memory" onPress={() => router.push("/search")} colors={colors} />
            <ActionTile
              icon="checkmark-done-outline"
              title="Commitments"
              {...(openCommitments ? { body: `${openCommitments} open` } : {})}
              onPress={() => router.push("/commitments" as never)}
              colors={colors}
            />
          </View>
        </View>

        {reviewCount > 0 ? (
          <Pressable
            onPress={() => router.push(`/review/${reviewInbox[0]?.conversationId}` as never)}
            style={[styles.pending, { backgroundColor: colors.sageSoft, borderColor: colors.line }]}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.sage} />
            <Text style={[styles.pendingText, { color: colors.ink }]}>
              {reviewCount} conversation{reviewCount === 1 ? "" : "s"} waiting for memory review
            </Text>
            <Ionicons name="arrow-forward" size={18} color={colors.sage} />
          </Pressable>
        ) : null}

        {pendingCount > 0 ? (
          <Pressable onPress={() => router.push("/pending")} style={[styles.pending, { backgroundColor: colors.accentSoft, borderColor: colors.line }]}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
            <Text style={[styles.pendingText, { color: colors.ink }]}>{pendingCount} recording{pendingCount === 1 ? "" : "s"} ready to continue</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.accent} />
          </Pressable>
        ) : null}

        <RecentHeading colors={colors} />
        {!loaded ? <MemoryListSkeleton /> : items.length ? (
          <>
            <View style={styles.memoryList}>{items.slice(0, 8).map(item => <MemoryCard key={item.id} item={item} colors={colors} onPress={() => router.push(`/conversation/${item.id}`)} />)}</View>
          </>
        ) : (
          <View style={styles.emptyVisual} accessibilityLabel="No recordings yet">
            <Image
              source={isDark
                ? require("../assets/empty-recordings-dark.png")
                : require("../assets/empty-recordings.png")}
              resizeMode="contain"
              style={styles.emptyImage}
            />
          </View>
        )}
      </ScrollView>
      <KeyboardStickyView
        style={[
          styles.composerWrap,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.line,
            paddingBottom: Math.max(insets.bottom, spacing.md),
          },
        ]}
      >
        <View style={[styles.composer, { backgroundColor: colors.surface }, !isDark && shadows.floating]}>
          <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
          <TextInput
            accessibilityLabel="Ask Memory from Home"
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={ask}
            placeholder="Ask anything about your memories…"
            placeholderTextColor={colors.faint}
            returnKeyType="send"
            style={[styles.askInput, { color: colors.ink }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send question"
            disabled={!question.trim()}
            onPress={ask}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: question.trim() ? colors.ink : colors.surfaceMuted },
              pressed && { transform: [{ scale: 0.93 }] },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={question.trim() ? colors.background : colors.faint} />
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: "hidden" },
  ambientBackground: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.9 },
  content: { paddingHorizontal: spacing.lg, paddingTop: 58, paddingBottom: 140 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandLogo: { width: 44, height: 44, borderRadius: 14, borderWidth: 1 },
  settings: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 13, fontWeight: "700", marginTop: spacing.xxxl, marginBottom: 5 },
  heading: { fontSize: typeScale.title2, lineHeight: 34, fontWeight: "800", letterSpacing: -0.7, marginBottom: spacing.sm },
  actionsGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
  actionTile: { flex: 1, minHeight: 112, borderWidth: 1, borderRadius: radii.md, padding: spacing.md, position: "relative" },
  actionTileLarge: { minHeight: 238 },
  smallActions: { flex: 1, gap: spacing.sm },
  tileIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  largeTileTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800", marginTop: spacing.md },
  tileTitle: { fontSize: 15, fontWeight: "800", marginTop: spacing.sm, paddingRight: 24 },
  tileBody: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  tileArrow: { position: "absolute", right: spacing.md, bottom: spacing.md },
  tileButton: { height: 40, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", marginTop: "auto" },
  tileButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  pending: { minHeight: 58, borderWidth: 1, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.md },
  pendingText: { flex: 1, fontSize: 13, fontWeight: "700" },
  recentHeading: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xxxl, marginBottom: spacing.md },
  recentTitle: { fontSize: typeScale.title3, fontWeight: "800", letterSpacing: -0.35 },
  headingLine: { flex: 1, height: 1 },
  emptyVisual: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.md },
  emptyImage: { width: 270, height: 270, borderRadius: radii.xl, borderWidth: 0 },
  memoryList: { gap: spacing.sm },
  memoryCard: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md },
  memoryDate: { fontSize: 12, fontWeight: "600" },
  memoryTitle: { fontSize: 16, fontWeight: "800", marginTop: spacing.sm },
  memorySummary: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  memoryBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  memorySignals: { fontSize: 11 },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  composer: { minHeight: 58, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.md, paddingRight: 7, paddingVertical: 7 },
  askInput: { flex: 1, minHeight: 44, fontSize: typeScale.body, paddingVertical: 10 },
  send: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
