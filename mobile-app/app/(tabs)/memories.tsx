import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConversationRow } from "../../src/components/ConversationRow";
import { useTabBarClearance } from "../../src/components/FloatingTabBar";
import { SegmentedChips } from "../../src/components/SegmentedChips";
import { MemoryListSkeleton } from "../../src/components/ui";
import { listConversations, type ConversationListItem } from "../../src/db/conversations";
import { listFolders, onFoldersChanged, type Folder } from "../../src/db/folders";
import { filterConversations, groupByDay, type ConversationFilter } from "../../src/utils/grouping";
import { fonts, radii, shadows, spacing, typeScale, useAppTheme } from "../../src/theme";

export default function MemoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  const { colors, isDark } = useAppTheme();
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [conversations, folderList] = await Promise.all([listConversations(), listFolders()]);
    setItems(conversations);
    setFolders(folderList);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => onFoldersChanged(() => void listFolders().then(setFolders)), []);

  const filterOptions = useMemo(() => {
    const options: Array<{ value: ConversationFilter; label: string }> = [
      { value: "all", label: "All" },
      { value: "recordings", label: "Recordings" },
    ];
    if (items?.some((item) => item.source === "google_meet")) options.push({ value: "meet", label: "Google Meet" });
    if (items?.some((item) => item.pendingReviewCount > 0)) options.push({ value: "review", label: "Needs review" });
    return options;
  }, [items]);

  const groups = useMemo(
    () => groupByDay(filterConversations(items ?? [], { query, filter })),
    [items, query, filter],
  );

  function askInstead(): void {
    const clean = query.trim();
    router.push((clean
      ? { pathname: "/search", params: { question: clean, autoSubmit: "1" } }
      : "/search") as never);
  }

  const searching = Boolean(query.trim()) || filter !== "all";

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: clearance }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load(); }} />}
    >
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>Memories</Text>

      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card]}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          accessibilityLabel="Search memories"
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles, summaries, people"
          placeholderTextColor={colors.faint}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.ink }]}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filters}>
        <SegmentedChips options={filterOptions} value={filter} onChange={setFilter} />
      </View>

      {!searching ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Folders</Text>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push("/folders" as never)}>
              <Text style={[styles.link, { color: colors.accent }]}>{folders.length ? "See all" : "Manage"}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderScroll} contentContainerStyle={styles.folderRow}>
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                accessibilityRole="button"
                accessibilityLabel={`${folder.name}, ${folder.conversationCount} memories`}
                onPress={() => router.push(`/folder/${folder.id}` as never)}
                style={({ pressed }) => [styles.folder, { backgroundColor: colors.surface, borderColor: colors.line }, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="folder" size={28} color={colors.accent} />
                <Text numberOfLines={1} style={[styles.folderName, { color: colors.ink }]}>{folder.name}</Text>
                <Text style={[styles.folderCount, { color: colors.muted }]}>
                  {folder.conversationCount} memor{folder.conversationCount === 1 ? "y" : "ies"}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New folder"
              onPress={() => router.push("/folders" as never)}
              style={({ pressed }) => [styles.folder, styles.newFolder, { borderColor: colors.line }, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="add" size={26} color={colors.muted} />
              <Text style={[styles.folderName, { color: colors.muted }]}>New folder</Text>
            </Pressable>
          </ScrollView>
        </>
      ) : null}

      {items == null ? (
        <View style={styles.groupStart}><MemoryListSkeleton /></View>
      ) : groups.length ? (
        groups.map((group) => (
          <View key={group.title} style={styles.groupStart}>
            <Text style={[styles.groupTitle, { color: colors.muted }]}>{group.title.toUpperCase()}</Text>
            <View style={styles.list}>
              {group.items.map((item) => (
                <ConversationRow
                  key={item.id}
                  item={item}
                  showDate={group.title !== "Today" && group.title !== "Yesterday"}
                  onPress={() => router.push(`/conversation/${item.id}`)}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.empty}>
          <Ionicons name={searching ? "search-outline" : "mic-outline"} size={32} color={colors.faint} />
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            {searching ? "No matching memories" : "No memories yet"}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.muted }]}>
            {searching ? "Try other words, or ask Memory to search what was said." : "Tap the mic below to record your first conversation."}
          </Text>
          {query.trim() ? (
            <Pressable accessibilityRole="button" onPress={askInstead} style={({ pressed }) => [styles.askChip, { backgroundColor: colors.ink }, pressed && { opacity: 0.8 }]}>
              <Ionicons name="sparkles" size={15} color={colors.accent} />
              <Text style={[styles.askChipText, { color: colors.background }]}>Ask Memory instead</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg },
  heading: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: -0.3 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  searchInput: { flex: 1, minHeight: 44, fontSize: typeScale.body },
  filters: { marginTop: spacing.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: typeScale.title3, fontWeight: "800", letterSpacing: -0.35 },
  link: { fontSize: 14, fontWeight: "800" },
  folderScroll: { marginHorizontal: -spacing.lg },
  folderRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  folder: { width: 118, minHeight: 104, borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, justifyContent: "flex-end", gap: 2 },
  newFolder: { borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  folderName: { fontSize: 14, fontWeight: "800", marginTop: spacing.xs },
  folderCount: { fontSize: 11 },
  groupStart: { marginTop: spacing.xl },
  groupTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing.xs, marginLeft: spacing.xxs },
  list: { gap: spacing.xs },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.xs },
  emptyTitle: { fontSize: typeScale.bodyLarge, fontWeight: "800", marginTop: spacing.xs },
  emptyBody: { fontSize: typeScale.caption, lineHeight: 18, textAlign: "center", maxWidth: 280 },
  askChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radii.pill, paddingHorizontal: 16, minHeight: 40, marginTop: spacing.sm },
  askChipText: { fontSize: 13, fontWeight: "800" },
});
