import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { greeting } from "../../utils/format";
import { fonts, radii, spacing, typeScale, useAppTheme } from "../../theme";

/** Big name field with a live preview of how Memory will greet you. */
export function NameField({ value, onChange, onSubmit }: { value: string; onChange: (value: string) => void; onSubmit: () => void }) {
  const { colors, isDark } = useAppTheme();
  const first = value.trim().split(/\s+/)[0];
  return (
    <View style={{ gap: spacing.md }}>
      <TextInput
        accessibilityLabel="Your name"
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        autoFocus
        autoCapitalize="words"
        autoComplete="name"
        textContentType="givenName"
        returnKeyType="next"
        placeholder="Your first name"
        placeholderTextColor={colors.faint}
        style={[
          styles.nameInput,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: value.trim() ? colors.accent : colors.line },
        ]}
      />
      <View style={[styles.preview, { backgroundColor: isDark ? colors.surfaceMuted : colors.surface, borderColor: colors.line }]}>
        <View style={[styles.previewAvatar, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.previewInitial, { color: colors.accent }]}>{(first?.[0] ?? "M").toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.previewEyebrow, { color: colors.muted }]}>PREVIEW</Text>
          <Text numberOfLines={1} style={[styles.previewText, { color: colors.ink }]}>
            {greeting()}{first ? ", " : ""}
            {first ? <Text style={{ fontFamily: fonts.displayItalic, color: colors.accent }}>{first}</Text> : null}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Selectable card with an icon, title and one-line description. */
export function OptionCard({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line },
        pressed && { transform: [{ scale: 0.985 }] },
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: selected ? colors.accent : colors.surfaceMuted }]}>
        <Ionicons name={icon} size={19} color={selected ? "#FFFFFF" : colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.optionBody, { color: colors.muted }]}>{description}</Text>
      </View>
      <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.accent : colors.faint} />
    </Pressable>
  );
}

/** Small pill choice for secondary, optional questions. */
export function ChoicePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: selected ? colors.ink : colors.surface, borderColor: selected ? colors.ink : colors.line }]}
    >
      <Text style={[styles.pillText, { color: selected ? colors.background : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

/** Caption that changes as choices change, so answers visibly matter. */
export function LiveCaption({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.caption, { backgroundColor: colors.warmSoft }]}>
      <Ionicons name="sparkles" size={15} color={colors.warm} />
      <Text style={[styles.captionText, { color: colors.ink }]}>{text}</Text>
    </View>
  );
}

/** Short reassurance rows (privacy step). */
export function PromiseRow({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.promise}>
      <View style={[styles.promiseIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.optionBody, { color: colors.muted }]}>{body}</Text>
      </View>
    </View>
  );
}

/** Inline status line (success / problem) under an action. */
export function StatusLine({ tone, text }: { tone: "success" | "error" | "info"; text: string }) {
  const { colors } = useAppTheme();
  const color = tone === "success" ? colors.accent : tone === "error" ? colors.danger : colors.muted;
  const icon = tone === "success" ? "checkmark-circle" : tone === "error" ? "alert-circle" : "information-circle";
  return (
    <View accessibilityLiveRegion="polite" style={styles.status}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statusText, { color }]}>{text}</Text>
    </View>
  );
}

/** "Your Memory" card on the last step, echoing what they told us. */
export function SummaryCard({ rows }: { rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] }) {
  const { colors, isDark } = useAppTheme();
  return (
    <View style={[styles.summary, { backgroundColor: isDark ? colors.surfaceMuted : colors.surface, borderColor: colors.line }]}>
      {rows.map((row, index) => (
        <View key={row.label} style={[styles.summaryRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
          <Ionicons name={row.icon} size={18} color={colors.accent} />
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{row.label}</Text>
          <Text numberOfLines={2} style={[styles.summaryValue, { color: colors.ink }]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  nameInput: {
    minHeight: 62,
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.display,
    fontSize: 28,
  },
  preview: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  previewAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  previewInitial: { fontSize: 17, fontWeight: "800" },
  previewEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  previewText: { fontFamily: fonts.display, fontSize: 24, marginTop: 1 },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm + 2, borderRadius: radii.md, borderWidth: 1.5 },
  optionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontSize: typeScale.body, fontWeight: "800" },
  optionBody: { fontSize: 13, lineHeight: 18, marginTop: 1 },
  pill: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 14, minHeight: 38, justifyContent: "center" },
  pillText: { fontSize: 13.5, fontWeight: "700" },
  caption: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: 10 },
  captionText: { flex: 1, fontSize: 13.5, fontWeight: "700", lineHeight: 19 },
  promise: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  promiseIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  status: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  statusText: { fontSize: 14, fontWeight: "700", flexShrink: 1, textAlign: "center" },
  summary: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 13 },
  summaryLabel: { fontSize: 13, fontWeight: "700", width: 84 },
  summaryValue: { flex: 1, fontSize: 14, fontWeight: "800", textAlign: "right" },
});
