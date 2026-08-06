import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getPerson,
  updatePerson,
  type PersonProfile,
  type PersonProfileUpdate,
} from "../../src/db/people";
import { InlineState } from "../../src/components/ui";
import { KeyboardScreen } from "../../src/components/KeyboardScreen";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../../src/theme";

const EMPTY_FORM: PersonProfileUpdate = {
  name: "",
  relationship: "",
  email: "",
  phone: "",
  notes: "",
};

function PersonField({
  label,
  value,
  placeholder,
  icon,
  keyboardType = "default",
  multiline = false,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  onChangeText: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <View style={[
        styles.inputShell,
        multiline && styles.notesShell,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
        <Ionicons name={icon} size={19} color={colors.accent} style={multiline && styles.notesIcon} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
          autoCorrect={keyboardType !== "email-address"}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          onChangeText={onChangeText}
          style={[styles.input, multiline && styles.notesInput, { color: colors.ink }]}
        />
      </View>
    </View>
  );
}

export default function PersonEditorScreen() {
  const { id, conversationId, speakerLabel } = useLocalSearchParams<{
    id: string;
    conversationId?: string;
    speakerLabel?: string;
  }>();
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [person, setPerson] = useState<PersonProfile | null>();
  const [form, setForm] = useState<PersonProfileUpdate>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    void getPerson(id).then((stored) => {
      setPerson(stored);
      if (stored) {
        setForm({
          name: stored.name,
          relationship: stored.relationship,
          email: stored.email,
          phone: stored.phone,
          notes: stored.notes,
        });
      }
    });
  }, [id]);

  function change(key: keyof PersonProfileUpdate, value: string): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      Alert.alert("Name needed", "Enter the speaker’s name before saving.");
      return;
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      Alert.alert("Check the email", "Enter a valid email address or leave it blank.");
      return;
    }
    setSaving(true);
    try {
      await updatePerson(id, form);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (cause) {
      Alert.alert(
        "Couldn’t save person",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (person === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="person-outline" title="Opening person…" loading />
      </View>
    );
  }
  if (person === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="person-outline" title="Person not found" />
      </View>
    );
  }

  const context = person.conversations.find((item) => item.id === conversationId)
    ?? person.conversations[0];
  const sourceLabel = speakerLabel || context?.speakerLabel;

  return (
    <KeyboardScreen
      backgroundColor={colors.background}
      contentContainerStyle={styles.content}
      bottomOffset={88}
    >
        <View style={styles.personHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.surface }]}>
            <Text style={[styles.initial, { color: colors.accent }]}>
              {form.name.trim().slice(0, 1).toUpperCase() || "?"}
            </Text>
          </View>
          {sourceLabel ? (
            <View style={[styles.sourcePill, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="mic-outline" size={14} color={colors.muted} />
              <Text style={[styles.sourceText, { color: colors.muted }]}>{sourceLabel}</Text>
            </View>
          ) : null}
          {context ? (
            <Text numberOfLines={2} style={[styles.context, { color: colors.muted }]}>
              Heard in “{context.title}”
            </Text>
          ) : null}
        </View>

        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Who is this person?</Text>
        <Text style={[styles.intro, { color: colors.muted }]}>
          Changes apply everywhere this person appears in Memory AI.
        </Text>
        <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card]}>
          <PersonField label="Name" value={form.name} placeholder="Enter their name" icon="person-outline" onChangeText={(value) => change("name", value)} />
          <PersonField label="Relationship or role" value={form.relationship} placeholder="Friend, client, manager…" icon="people-outline" onChangeText={(value) => change("relationship", value)} />
          <PersonField label="Email" value={form.email} placeholder="Optional email" icon="mail-outline" keyboardType="email-address" onChangeText={(value) => change("email", value)} />
          <PersonField label="Phone" value={form.phone} placeholder="Optional phone number" icon="call-outline" keyboardType="phone-pad" onChangeText={(value) => change("phone", value)} />
          <PersonField label="Notes" value={form.notes} placeholder="What should you remember about them?" icon="document-text-outline" multiline onChangeText={(value) => change("notes", value)} />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.accent },
            pressed && styles.pressed,
            saving && { opacity: 0.55 },
          ]}
        >
          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          <Text style={styles.saveText}>{saving ? "Saving…" : "Save person"}</Text>
        </Pressable>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  personHeader: { alignItems: "center", paddingVertical: spacing.md },
  avatar: { width: 78, height: 78, borderRadius: 39, borderWidth: 7, alignItems: "center", justifyContent: "center", ...shadows.floating },
  initial: { fontSize: 31, fontWeight: "800" },
  sourcePill: { minHeight: 30, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.sm, marginTop: spacing.md },
  sourceText: { fontSize: typeScale.caption, fontWeight: "700" },
  context: { maxWidth: 300, fontSize: typeScale.caption, lineHeight: 18, textAlign: "center", marginTop: spacing.xs },
  sectionTitle: { fontSize: typeScale.title3, fontWeight: "800", letterSpacing: -0.4, marginTop: spacing.md },
  intro: { fontSize: 13, lineHeight: 19, marginTop: 3, marginBottom: spacing.sm },
  form: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
  fieldGroup: { gap: 7 },
  label: { fontSize: 13, fontWeight: "800", marginLeft: 2 },
  inputShell: { minHeight: 54, borderWidth: 1, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  input: { flex: 1, minHeight: 52, fontSize: typeScale.body },
  notesShell: { minHeight: 120, alignItems: "flex-start", paddingTop: spacing.md },
  notesIcon: { marginTop: 2 },
  notesInput: { minHeight: 96, lineHeight: 21, paddingTop: 0 },
  saveButton: { minHeight: 58, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.xl },
  saveText: { color: "#FFFFFF", fontSize: typeScale.bodyLarge, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
});
