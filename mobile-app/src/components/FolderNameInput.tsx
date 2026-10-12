import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { FOLDER_NAME_MAX } from "../services/folderSyncMerge";
import { radii, spacing, typeScale, useAppTheme } from "../theme";

export function FolderNameInput({
  initialValue = "",
  placeholder = "New folder name",
  actionLabel = "Create",
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  initialValue?: string;
  placeholder?: string;
  actionLabel?: string;
  autoFocus?: boolean;
  onSubmit: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const { colors } = useAppTheme();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = value.trim().length > 0 && !saving;

  async function submit(): Promise<void> {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(value);
      setValue("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Folder could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Ionicons name="folder-outline" size={19} color={colors.muted} />
        <TextInput
          accessibilityLabel={placeholder}
          value={value}
          onChangeText={(next) => {
            setValue(next);
            setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          maxLength={FOLDER_NAME_MAX}
          autoFocus={autoFocus}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          style={[styles.input, { color: colors.ink }]}
        />
        {onCancel ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8} onPress={onCancel}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!valid}
          onPress={() => void submit()}
          style={[styles.button, { backgroundColor: valid ? colors.accent : colors.surfaceMuted }]}
        >
          <Text style={[styles.buttonText, { color: valid ? "#FFFFFF" : colors.faint }]}>{saving ? "…" : actionLabel}</Text>
        </Pressable>
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, borderWidth: 1, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.md, paddingRight: 6 },
  input: { flex: 1, fontSize: typeScale.body, paddingVertical: spacing.sm },
  button: { minHeight: 42, borderRadius: radii.sm, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 14, fontWeight: "800" },
  error: { fontSize: typeScale.caption, marginTop: 6, marginLeft: spacing.xs },
});
