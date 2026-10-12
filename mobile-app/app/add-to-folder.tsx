import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { FolderNameInput } from "../src/components/FolderNameInput";
import { KeyboardScreen } from "../src/components/KeyboardScreen";
import {
  createFolder,
  getFolderIdsForConversation,
  listFolders,
  setConversationFolders,
  type Folder,
} from "../src/db/folders";
import { radii, spacing, typeScale, useAppTheme } from "../src/theme";

export default function AddToFolderScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    void Promise.all([listFolders(), getFolderIdsForConversation(conversationId)]).then(([all, current]) => {
      setFolders(all);
      setSelected(new Set(current));
    });
  }, [conversationId]);

  function toggle(id: string): void {
    void Haptics.selectionAsync();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(): Promise<void> {
    if (!conversationId) return;
    setSaving(true);
    try {
      await setConversationFolders(conversationId, [...selected]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (cause) {
      Alert.alert("Folders weren’t updated", cause instanceof Error ? cause.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardScreen backgroundColor={colors.background} contentContainerStyle={styles.content}>
      <FolderNameInput onSubmit={async (name) => {
        const folder = await createFolder(name);
        setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)));
        setSelected((current) => new Set(current).add(folder.id));
      }} />
      <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {folders.length === 0 ? (
          <Text style={[styles.empty, { color: colors.muted }]}>Create your first folder above.</Text>
        ) : folders.map((folder, index) => {
          const checked = selected.has(folder.id);
          return (
            <Pressable
              key={folder.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => toggle(folder.id)}
              style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
            >
              <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.accent : colors.faint} />
              <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{folder.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void save()}
        style={({ pressed }) => [styles.save, { backgroundColor: colors.accent }, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.saveText}>{saving ? "Saving…" : "Done"}</Text>
      </Pressable>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  list: { borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontSize: typeScale.body, fontWeight: "700" },
  empty: { fontSize: typeScale.body, paddingVertical: spacing.lg, textAlign: "center" },
  save: { minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
