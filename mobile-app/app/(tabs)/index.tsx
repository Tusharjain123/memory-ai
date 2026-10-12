import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import type { GoogleMeeting } from "../../src/contracts";
import { listConversations, type ConversationListItem } from "../../src/db/conversations";
import { listPendingRecordings } from "../../src/db/pendingRecordings";
import { countOpenCommitments, countPendingReviews, listPendingReviewConversations } from "../../src/db/commitments";
import { getUserProfile, EMPTY_PROFILE, saveUserProfile } from "../../src/db/profile";
import { countAskTurns } from "../../src/db/askTurns";
import { countKnownPeople, findKnownPeople, type KnownPerson } from "../../src/db/people";
import { BottomSheet } from "../../src/components/BottomSheet";
import { GettingStartedCard, type ChecklistItem } from "../../src/components/GettingStartedCard";
import { CaptureScene, CelebrateScene } from "../../src/components/illustrations/scenes";
import { MemoryListSkeleton } from "../../src/components/ui";
import { BrandLoader } from "../../src/components/BrandLoader";
import { ConversationRow } from "../../src/components/ConversationRow";
import { FirstRunGuide, type OnboardingDetails } from "../../src/components/FirstRunGuide";
import { useTabBarClearance } from "../../src/components/FloatingTabBar";
import { nextCalendarEvent } from "../../src/services/googleWorkspace";
import {
  claimFirstMemoryCelebration,
  completeOnboarding,
  dismissChecklist,
  isChecklistDismissed,
  shouldShowOnboarding,
} from "../../src/services/onboarding";
import { useAuthStore } from "../../src/store/useAuthStore";
import { greeting } from "../../src/utils/format";
import { homePriority, parseGoals } from "../../src/utils/goals";
import { formatTokens, tokenCount } from "../../src/utils/money";
import { useWalletStore } from "../../src/store/useWalletStore";
import { fonts, radii, shadows, spacing, type AppColors, typeScale, useAppTheme } from "../../src/theme";

const RECENT_COUNT = 4;
const ASK_SUGGESTIONS = ["What did I promise?", "Summarize my last meeting", "What's still open?"];

function minutesUntil(iso: string, now = Date.now()): number {
  return Math.round((Date.parse(iso) - now) / 60_000);
}

function upNextLabel(meeting: GoogleMeeting): string {
  const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const minutes = minutesUntil(meeting.start);
  const when = minutes <= 0 ? "now" : minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
  return `${time(meeting.start)} – ${time(meeting.end)} · ${when}`;
}

function UpNextCard({ meeting, colors, onPress, prep, onPrep }: {
  meeting: GoogleMeeting; colors: AppColors; onPress: () => void; prep: KnownPerson | null; onPrep: () => void;
}) {
  const live = minutesUntil(meeting.start) <= 0;
  return (
    <View style={[styles.upNextWrap, { backgroundColor: colors.accentSoft }]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Up next: ${meeting.title}, ${upNextLabel(meeting)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.upNext, pressed && styles.pressed]}
    >
      <View style={[styles.upNextIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name="calendar-outline" size={20} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.upNextEyebrow, { color: colors.accent }]}>{live ? "HAPPENING NOW" : "UP NEXT"}</Text>
        <Text numberOfLines={1} style={[styles.upNextTitle, { color: colors.ink }]}>{meeting.title}</Text>
        <Text numberOfLines={1} style={[styles.upNextMeta, { color: colors.muted }]}>
          {upNextLabel(meeting)}
          {meeting.attendees.length ? ` · ${meeting.attendees.length} people` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.accent} />
    </Pressable>
    {prep ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Prepare for ${prep.name}`}
        onPress={onPrep}
        style={({ pressed }) => [styles.prep, { borderTopColor: colors.overlay }, pressed && styles.pressed]}
      >
        <Ionicons name="sparkles" size={14} color={colors.warm} />
        <Text style={[styles.prepText, { color: colors.ink }]}>
          You've talked with {prep.name.split(" ")[0]} {prep.conversationCount} time{prep.conversationCount === 1 ? "" : "s"} · <Text style={{ color: colors.accent }}>Prep brief</Text>
        </Text>
      </Pressable>
    ) : null}
    </View>
  );
}

function StatusChip({ icon, label, tint, background, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; tint: string; background: string; onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: background }, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={15} color={tint} />
      <Text style={[styles.chipText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  const { colors, isDark } = useAppTheme();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [openCommitments, setOpenCommitments] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [firstReviewId, setFirstReviewId] = useState<string | null>(null);
  const [initial, setInitial] = useState("M");
  const [firstName, setFirstName] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [askCount, setAskCount] = useState(0);
  const [peopleCount, setPeopleCount] = useState(0);
  const [checklistHidden, setChecklistHidden] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const [prepPerson, setPrepPerson] = useState<KnownPerson | null>(null);
  const [upNext, setUpNext] = useState<GoogleMeeting | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const calendarConnected = useAuthStore((state) => state.status === "signedIn" && state.calendarStatus === "connected");
  const cloudAvailable = useAuthStore((state) => state.status !== "unavailable");
  const signedIn = useAuthStore((state) => state.status === "signedIn");
  const wallet = useWalletStore((state) => state.wallet);
  const refreshWallet = useWalletStore((state) => state.refresh);

  useEffect(() => {
    void shouldShowOnboarding().then(setShowOnboarding).catch(() => setShowOnboarding(false));
  }, []);

  // The first-run guide is full screen: hide the floating tab bar until it is done.
  useLayoutEffect(() => {
    navigation.setOptions({ tabBarHidden: showOnboarding !== false } as never);
  }, [navigation, showOnboarding]);

  const load = useCallback(async () => {
    const [conversations, pending, commitments, reviews, inbox, profile, asks, people, dismissed] = await Promise.all([
      listConversations(),
      listPendingRecordings(),
      countOpenCommitments(),
      countPendingReviews(),
      listPendingReviewConversations(),
      getUserProfile(),
      countAskTurns(),
      countKnownPeople(),
      isChecklistDismissed(),
    ]);
    setItems(conversations);
    setPendingCount(pending.length);
    setOpenCommitments(commitments);
    setReviewCount(reviews);
    setFirstReviewId(inbox[0]?.conversationId ?? null);
    setInitial(profile?.name.trim().slice(0, 1).toUpperCase() || "M");
    setFirstName(profile?.name.trim().split(/\s+/)[0] ?? "");
    setGoals(parseGoals(profile?.onboardingGoal));
    setAskCount(asks);
    setPeopleCount(people);
    setChecklistHidden(dismissed);
    // A one-time moment when the very first memory lands.
    if (conversations.length === 1 && await claimFirstMemoryCelebration()) setCelebrate(true);
    setLoaded(true);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useFocusEffect(useCallback(() => { if (signedIn) void refreshWallet(); }, [refreshWallet, signedIn]));

  // "Up next" is optional; any failure simply hides the card.
  useFocusEffect(useCallback(() => {
    if (!calendarConnected) {
      setUpNext(null);
      return;
    }
    let cancelled = false;
    void nextCalendarEvent()
      .then(async (meeting) => {
        if (cancelled) return;
        setUpNext(meeting);
        const known = meeting ? await findKnownPeople(meeting.attendees.filter((person) => !person.self)) : [];
        if (!cancelled) setPrepPerson(known[0] ?? null);
      })
      .catch(() => { if (!cancelled) { setUpNext(null); setPrepPerson(null); } });
    return () => { cancelled = true; };
  }, [calendarConnected]));

  function record() { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/record"); }
  function ask(question?: string): void {
    void Haptics.selectionAsync();
    router.push({
      pathname: "/search",
      params: question ? { question, autoSubmit: "1" } : { focus: "1" },
    } as never);
  }

  async function finishOnboarding(destination: "home" | "record", details?: OnboardingDetails): Promise<void> {
    // Merge, so anything Google sign-in already filled in (name, email) is kept.
    const typed = Object.fromEntries(Object.entries(details ?? {}).filter(([, value]) => value.trim()));
    if (Object.keys(typed).length) {
      const existing = await getUserProfile();
      await saveUserProfile({ ...EMPTY_PROFILE, ...existing, ...typed });
    }
    await completeOnboarding();
    await load();
    setShowOnboarding(false);
    if (destination === "record") record();
  }

  // Avoid flashing the dashboard before the first-run check completes.
  if (showOnboarding === null) return <BrandLoader />;
  if (showOnboarding) return <FirstRunGuide onFinish={finishOnboarding} />;

  const lowBalance = signedIn && Boolean(wallet?.lowBalance);
  const hasChips = reviewCount > 0 || openCommitments > 0 || pendingCount > 0;
  const commitmentsFirst = homePriority(goals)[0] === "commitments";
  const checklist: ChecklistItem[] = [
    { key: "record", icon: "mic-outline", label: "Record your first memory", done: items.length > 0, onPress: record },
    ...(cloudAvailable
      ? [{ key: "calendar", icon: "calendar-outline" as const, label: "Connect your calendar", done: calendarConnected, onPress: () => router.push("/calendar" as never) }]
      : []),
    { key: "ask", icon: "sparkles-outline", label: "Ask Memory a question", done: askCount > 0, onPress: () => router.push("/search") },
    { key: "people", icon: "people-outline", label: "Name someone you talked to", done: peopleCount > 0, onPress: () => router.push("/people" as never) },
  ];
  const showChecklist = loaded && !checklistHidden && checklist.some((item) => !item.done);
  const commitmentsChip = openCommitments > 0 ? (
    <StatusChip
      key="commitments"
      icon="checkmark-done-outline"
      label={`${openCommitments} open commitment${openCommitments === 1 ? "" : "s"}`}
      tint={colors.accent}
      background={colors.accentSoft}
      onPress={() => router.push("/commitments" as never)}
    />
  ) : null;
  const subtitle = [
    openCommitments > 0 ? `${openCommitments} promise${openCommitments === 1 ? "" : "s"} open` : null,
  ].filter(Boolean).join(" · ") || (items.length ? `${items.length} memor${items.length === 1 ? "y" : "ies"} kept` : "Let's capture your first memory");

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: clearance + spacing.lg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={styles.topBar}>
          <Text numberOfLines={1} style={[styles.eyebrow, styles.flex, { color: colors.accent, marginBottom: 0 }]}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
          </Text>
          {cloudAvailable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={signedIn && wallet ? `Wallet balance ${formatTokens(wallet.balanceMicros)}` : "Wallet: get 5,000 free tokens"}
              onPress={() => router.push("/wallet" as never)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.balancePill,
                lowBalance
                  ? { backgroundColor: colors.warmSoft, borderColor: colors.warmSoft }
                  : { backgroundColor: colors.surface, borderColor: colors.line },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="wallet" size={14} color={lowBalance ? colors.warm : colors.accent} />
              <Text style={[styles.balanceText, { color: lowBalance ? colors.warm : colors.ink }]}>
                {signedIn ? (wallet ? tokenCount(wallet.balanceMicros) : "···") : "Get 5,000 free"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile and settings"
            onPress={() => router.push("/account")}
            hitSlop={6}
            style={({ pressed }) => [styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.line }, pressed && styles.pressed]}
          >
            <Text style={[styles.avatarText, { color: colors.accent }]}>{initial}</Text>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
          {greeting()}{firstName ? ", " : ""}
          {firstName ? <Text style={{ fontFamily: fonts.displayItalic, color: colors.accent }}>{firstName}</Text> : null}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Ask Memory about your conversations"
          onPress={() => ask()}
          style={({ pressed }) => [styles.ask, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card, pressed && styles.pressed]}
        >
          <View style={[styles.askIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="sparkles" size={16} color={colors.accent} />
          </View>
          <Text numberOfLines={1} style={[styles.askPlaceholder, { color: colors.muted }]}>Ask about your conversations…</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.faint} />
        </Pressable>
        {items.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll} contentContainerStyle={styles.chips}>
            {ASK_SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                accessibilityRole="button"
                onPress={() => ask(suggestion)}
                style={({ pressed }) => [styles.suggestion, { borderColor: colors.line }, pressed && styles.pressed]}
              >
                <Text style={[styles.suggestionText, { color: colors.ink }]}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {upNext ? (
          <UpNextCard
            meeting={upNext}
            colors={colors}
            prep={prepPerson}
            onPress={() => router.push(`/meeting/${encodeURIComponent(upNext.eventId)}` as never)}
            onPrep={() => prepPerson && router.push(`/person/${prepPerson.id}/prep` as never)}
          />
        ) : null}

        {hasChips ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
            {commitmentsFirst ? commitmentsChip : null}
            {reviewCount > 0 && firstReviewId ? (
              <StatusChip
                icon="shield-checkmark-outline"
                label={`${reviewCount} to review`}
                tint={colors.sage}
                background={colors.sageSoft}
                onPress={() => router.push(`/review/${firstReviewId}` as never)}
              />
            ) : null}
            {commitmentsFirst ? null : commitmentsChip}
            {pendingCount > 0 ? (
              <StatusChip
                icon="cloud-upload-outline"
                label={`${pendingCount} saved recording${pendingCount === 1 ? "" : "s"}`}
                tint={colors.ink}
                background={colors.surfaceMuted}
                onPress={() => router.push("/pending")}
              />
            ) : null}
          </ScrollView>
        ) : null}

        {showChecklist ? (
          <GettingStartedCard
            items={checklist}
            onDismiss={() => {
              setChecklistHidden(true);
              void dismissChecklist();
            }}
          />
        ) : null}

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Recent</Text>
          {items.length > RECENT_COUNT ? (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push("/memories" as never)}>
              <Text style={[styles.link, { color: colors.accent }]}>See all</Text>
            </Pressable>
          ) : null}
        </View>

        {!loaded ? <MemoryListSkeleton /> : items.length ? (
          <View style={styles.list}>
            {items.slice(0, RECENT_COUNT).map((item) => (
              <ConversationRow key={item.id} item={item} onPress={() => router.push(`/conversation/${item.id}`)} />
            ))}
          </View>
        ) : (
          <View style={styles.empty} accessibilityLabel="No recordings yet">
            {showChecklist ? null : <CaptureScene size={230} />}
            <Text style={[styles.emptyText, { color: colors.muted }]}>Tap the mic to capture your first conversation.</Text>
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={celebrate} onClose={() => setCelebrate(false)}>
        <View style={styles.celebrate}>
          <CelebrateScene size={220} />
          <Text accessibilityRole="header" style={[styles.celebrateTitle, { color: colors.ink }]}>
            Your first memory{firstName ? `, ${firstName}` : ""}.
          </Text>
          <Text style={[styles.celebrateBody, { color: colors.muted }]}>
            It's saved on this phone. Ask about it any time: what was decided, who said what, what you promised.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCelebrate(false);
              router.push({ pathname: "/search", params: { question: "What happened in my last conversation?", autoSubmit: "1" } } as never);
            }}
            style={({ pressed }) => [styles.celebrateButton, { backgroundColor: colors.ink }, pressed && styles.pressed]}
          >
            <Ionicons name="sparkles" size={17} color={colors.background} />
            <Text style={[styles.celebrateButtonText, { color: colors.background }]}>Try asking about it</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setCelebrate(false)} style={styles.celebrateLater}>
            <Text style={[styles.link, { color: colors.muted }]}>Later</Text>
          </Pressable>
        </View>
      </BottomSheet>

    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  balancePill: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12 },
  balanceText: { fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 4 },
  heading: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, marginTop: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "800" },
  ask: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 54, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 8, paddingRight: spacing.md, marginTop: spacing.lg },
  askIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  askPlaceholder: { flex: 1, fontSize: typeScale.body },
  suggestion: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 13, minHeight: 34, justifyContent: "center" },
  suggestionText: { fontSize: 13, fontWeight: "700" },
  upNextWrap: { borderRadius: radii.lg, marginTop: spacing.lg, overflow: "hidden" },
  upNext: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  prep: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 11, borderTopWidth: 1 },
  prepText: { flex: 1, fontSize: 13, fontWeight: "700" },
  upNextIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  upNextEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  upNextTitle: { fontSize: typeScale.bodyLarge, fontWeight: "800", marginTop: 2 },
  upNextMeta: { fontSize: typeScale.caption, marginTop: 2 },
  suggestionsScroll: { marginTop: spacing.sm, marginHorizontal: -spacing.lg },
  chipsScroll: { marginTop: spacing.lg, marginHorizontal: -spacing.lg },
  chips: { gap: spacing.xs, paddingHorizontal: spacing.lg },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radii.pill, paddingHorizontal: 14, minHeight: 36 },
  chipText: { fontSize: 13, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xxl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: typeScale.title3, fontWeight: "800", letterSpacing: -0.35 },
  link: { fontSize: 14, fontWeight: "800" },
  list: { gap: spacing.xs },
  empty: { alignItems: "center", paddingVertical: spacing.md, gap: spacing.sm },
  celebrate: { alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  celebrateTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, textAlign: "center" },
  celebrateBody: { fontSize: typeScale.body, lineHeight: 22, textAlign: "center", marginTop: spacing.xs },
  celebrateButton: { alignSelf: "stretch", minHeight: 54, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.lg },
  celebrateButtonText: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  celebrateLater: { minHeight: 44, justifyContent: "center" },
  emptyText: { fontSize: typeScale.body, textAlign: "center" },
});
