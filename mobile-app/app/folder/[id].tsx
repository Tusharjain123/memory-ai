import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  getFolder,
  getFolderIdsForConversation,
  listFolderConversations,
  setConversationFolders,
  type Folder,
  type FolderConversation,
} from "../../src/db/folders";
import { formatDuration, relativeDate } from "../../src/utils/format";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../../src/theme";

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [folder, setFolder] = useState<Folder | null | undefined>();
  const [items, setItems] = useState<FolderConversation[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setFolder(await getFolder(id));
    setItems(await listFolderConversations(id));
  }, [id]);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function removeFromFolder(conversationId: string): Promise<void> {
    const current = await getFolderIdsForConversation(conversationId);
    await setConversationFolders(conversationId, current.filter((folderId) => folderId !== id));
    await load();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: folder?.name ?? "Folder" }} />
      {folder === null ? (
        <Text style={[styles.empty, { color: colors.muted }]}>This folder was deleted.</Text>
      ) : items.length === 0 && folder ? (
        <View style={styles.emptyBox}>
          <Ionicons name="albums-outline" size={32} color={colors.faint} />
          <Text style={[styles.empty, { color: colors.muted }]}>
            No memories here yet. Open a memory, go to “More”, and choose “Add to folder”.
          </Text>
        </View>
      ) : null}
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => router.push(`/conversation/${item.id}`)}
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.copy}>
            <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{item.title}</Text>
            <Text numberOfLines={2} style={[styles.summary, { color: colors.muted }]}>{item.summary}</Text>
            <Text style={[styles.meta, { color: colors.faint }]}>{relativeDate(item.createdAt)} · {formatDuration(item.durationMs)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.title} from this folder`}
            hitSlop={10}
            onPress={() => void removeFromFolder(item.id)}
          >
            <Ionicons name="remove-circle-outline" size={22} color={colors.muted} />
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  emptyBox: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  empty: { fontSize: typeScale.body, lineHeight: 21, textAlign: "center", maxWidth: 300 },
  card: { borderWidth: 1, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  copy: { flex: 1 },
  title: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  summary: { fontSize: typeScale.caption, lineHeight: 18, marginTop: 3 },
  meta: { fontSize: 11, marginTop: 6 },
});
