import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardScreen } from "../src/components/KeyboardScreen";
import { FolderNameInput } from "../src/components/FolderNameInput";
import {
  createFolder,
  deleteFolder,
  listFolders,
  onFoldersChanged,
  renameFolder,
  type Folder,
} from "../src/db/folders";
import { useAuthStore } from "../src/store/useAuthStore";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

export default function FoldersScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const cloudSyncEnabled = useAuthStore((state) => state.status === "signedIn" && state.cloudSyncEnabled);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => setFolders(await listFolders()), []);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));
  useEffect(() => onFoldersChanged(() => void load()), [load]);

  function openActions(folder: Folder): void {
    void Haptics.selectionAsync();
    Alert.alert(folder.name, undefined, [
      { text: "Rename", onPress: () => setEditingId(folder.id) },
      {
        text: "Delete folder",
        style: "destructive",
        onPress: () => Alert.alert(
          `Delete “${folder.name}”?`,
          "The folder is removed. Memories inside it stay on your device.",
          [
            { text: "Keep folder", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => void deleteFolder(folder.id) },
          ],
        ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <KeyboardScreen backgroundColor={colors.background} contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: colors.muted }]}>
        Group memories by project, person or topic. A memory can live in more than one folder.
        {cloudSyncEnabled ? " Folders sync to your cloud account." : " Folders are stored on this device."}
      </Text>
      <FolderNameInput onSubmit={async (name) => {
        await createFolder(name);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }} />

      <View style={styles.list}>
        {folders?.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={34} color={colors.faint} />
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>No folders yet</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>Create one above, then add memories from a memory’s “More” tab.</Text>
          </View>
        ) : null}
        {folders?.map((folder) => editingId === folder.id ? (
          <FolderNameInput
            key={folder.id}
            initialValue={folder.name}
            actionLabel="Save"
            autoFocus
            onCancel={() => setEditingId(null)}
            onSubmit={async (name) => {
              await renameFolder(folder.id, name);
              setEditingId(null);
            }}
          />
        ) : (
          <Pressable
            key={folder.id}
            accessibilityRole="button"
            accessibilityHint="Long press to rename or delete"
            onPress={() => router.push(`/folder/${folder.id}` as never)}
            onLongPress={() => openActions(folder)}
            style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="folder" size={21} color={colors.accent} />
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{folder.name}</Text>
              <Text style={[styles.count, { color: colors.muted }]}>
                {folder.conversationCount} memor{folder.conversationCount === 1 ? "y" : "ies"}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`More options for ${folder.name}`} hitSlop={10} onPress={() => openActions(folder)}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
            </Pressable>
          </Pressable>
        ))}
      </View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  intro: { fontSize: typeScale.body, lineHeight: 21, marginBottom: spacing.md },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  card: { minHeight: 72, borderWidth: 1, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  icon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  name: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  count: { fontSize: typeScale.caption, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.xs },
  emptyTitle: { fontSize: typeScale.bodyLarge, fontWeight: "800", marginTop: spacing.xs },
  emptyBody: { fontSize: typeScale.caption, lineHeight: 18, textAlign: "center", maxWidth: 280 },
});
