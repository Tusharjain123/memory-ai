import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useCallback, type ComponentProps, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useState } from "react";
import { getUserProfile, type UserProfile } from "../src/db/profile";
import { useThemeStore, type ThemePreference } from "../src/store/useThemeStore";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName; body: string }[] = [
  { value: "system", label: "System", icon: "phone-portrait-outline", body: "Match your device appearance" },
  { value: "dark", label: "Dark", icon: "moon-outline", body: "Always use the dark theme" },
  { value: "light", label: "Light", icon: "sunny-outline", body: "Always use the light theme" },
];

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const { colors, isDark } = useAppTheme();
  return (
    <View style={styles.groupSection}>
      <Text style={[styles.groupTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card]}>{children}</View>
    </View>
  );
}

function SettingsRow({ icon, title, body, value, danger = false, last = false, onPress }: {
  icon: IconName; title: string; body?: string; value?: string; danger?: boolean; last?: boolean; onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerSoft : colors.accentSoft }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.accent} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: danger ? colors.danger : colors.ink }]}>{title}</Text>
        {body ? <Text style={[styles.rowBody, { color: colors.muted }]}>{body}</Text> : null}
      </View>
      {value ? <Text style={[styles.rowValue, { color: colors.muted }]}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </>
  );
  const shared = [styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [shared, pressed && { opacity: 0.58 }]}>{content}</Pressable>
  ) : <View style={shared}>{content}</View>;
}

function ThemeOptionRow({
  option,
  selected,
  last,
  onSelect,
}: {
  option: (typeof THEME_OPTIONS)[number];
  selected: boolean;
  last: boolean;
  onSelect: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.label} theme`}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
        pressed && { opacity: 0.58 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={option.icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.ink }]}>{option.label}</Text>
        <Text style={[styles.rowBody, { color: colors.muted }]}>{option.body}</Text>
      </View>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={selected ? colors.accent : colors.faint}
      />
    </Pressable>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const { colors, isDark, preference } = useAppTheme();
  const setPreference = useThemeStore((state) => state.setPreference);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useFocusEffect(useCallback(() => { void getUserProfile().then(setProfile); }, []));

  const detail = [profile?.email, profile?.phone].filter(Boolean).join(" · ") || "Optional details stored locally";
  const initial = profile?.name.trim().slice(0, 1).toUpperCase() || "M";

  async function selectTheme(next: ThemePreference): Promise<void> {
    if (next === preference) return;
    await setPreference(next);
    void Haptics.selectionAsync();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => router.push("/profile")}
        style={({ pressed }) => [styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card, pressed && { opacity: 0.7 }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}><Text style={[styles.initial, { color: colors.accent }]}>{initial}</Text></View>
        <View style={styles.profileCopy}>
          <Text style={[styles.name, { color: colors.ink }]}>{profile?.name || "Set up your profile"}</Text>
          <Text numberOfLines={1} style={[styles.profileDetail, { color: colors.muted }]}>{detail}</Text>
        </View>
        <Ionicons name="create-outline" size={21} color={colors.accent} />
      </Pressable>

      <SettingsGroup title="APPEARANCE">
        {THEME_OPTIONS.map((option, index) => (
          <ThemeOptionRow
            key={option.value}
            option={option}
            selected={preference === option.value}
            last={index === THEME_OPTIONS.length - 1}
            onSelect={() => void selectTheme(option.value)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="GENERAL">
        <SettingsRow icon="person-outline" title="Edit profile" body="Name, role, goals and contact details" onPress={() => router.push("/profile")} />
        <SettingsRow icon="people-outline" title="People" body="People remembered from your conversations" onPress={() => router.push("/people")} />
        <SettingsRow icon="shield-checkmark-outline" title="Privacy & security" body="Biometric lock and local-data controls" onPress={() => router.push("/settings")} />
        <SettingsRow last icon="archive-outline" title="Saved recordings" body="Continue recordings waiting to process" onPress={() => router.push("/pending")} />
      </SettingsGroup>

      <SettingsGroup title="SUPPORT & LEGAL">
        <SettingsRow icon="chatbubble-ellipses-outline" title="Send feedback" body="Report a problem or suggest what Memory should do next" onPress={() => router.push("/feedback" as never)} />
        <SettingsRow icon="document-text-outline" title="Terms of use" onPress={() => router.push("/terms")} />
        <SettingsRow icon="help-circle-outline" title="Help & privacy notes" body="How recording, processing, and storage work" onPress={() => router.push("/settings")} />
        <SettingsRow last icon="information-circle-outline" title="About Memory AI" body="What Memory does and how it works" value={`v${Constants.expoConfig?.version ?? "0.1.0"}`} onPress={() => router.push("/about")} />
      </SettingsGroup>

      <Text style={[styles.footer, { color: colors.faint }]}>Your profile is optional. Memory AI does not require an account.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  profileCard: { minHeight: 96, borderWidth: 1, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: typeScale.title2, fontWeight: "800" },
  profileCopy: { flex: 1 },
  name: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  profileDetail: { fontSize: typeScale.caption, marginTop: 4 },
  groupSection: { marginTop: spacing.xl },
  groupTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginLeft: spacing.xs, marginBottom: spacing.xs },
  groupCard: { borderWidth: 1, borderRadius: radii.lg, overflow: "hidden" },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "800" },
  rowBody: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  rowValue: { maxWidth: 80, fontSize: 12, textAlign: "right" },
  footer: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
