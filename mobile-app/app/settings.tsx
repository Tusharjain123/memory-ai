import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { deleteAllData, isBiometricLockEnabled, setBiometricLockEnabled } from "../src/services/privacy";
import { SectionHeader } from "../src/components/ui";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

export default function PrivacyScreen() {
  const { colors, isDark } = useAppTheme();
  const [lockEnabled, setLockEnabled] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { void isBiometricLockEnabled().then(setLockEnabled); }, []);

  async function toggleLock(value: boolean): Promise<void> {
    try {
      await setBiometricLockEnabled(value);
      setLockEnabled(value);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      Alert.alert("Lock wasn’t changed", cause instanceof Error ? cause.message : "Try again");
    }
  }

  function confirmDeleteAll(): void {
    Alert.alert("Delete everything from this device?", "Every memory, transcript, task, AI index, and recording will be permanently removed.", [
      { text: "Keep my memories", style: "cancel" },
      {
        text: "Delete everything",
        style: "destructive",
        onPress: () => {
          setDeleting(true);
          void deleteAllData()
            .then(() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Memory cleared", "All local conversation data has been removed.");
            })
            .catch((cause: unknown) => Alert.alert("Couldn’t delete everything", cause instanceof Error ? cause.message : "Try again"))
            .finally(() => setDeleting(false));
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={[styles.shield, { backgroundColor: colors.sageSoft }]}>
          <Ionicons name="shield-checkmark" size={34} color={colors.sage} />
        </View>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>Private by design</Text>
        <Text style={[styles.intro, { color: colors.muted }]}>Your conversation history belongs to you—not an account, not a cloud database.</Text>
      </View>

      <SectionHeader title="Protection" />
      <View style={[styles.settingCard, { backgroundColor: colors.surface }, !isDark && shadows.card]}>
        <View style={[styles.settingIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="finger-print" size={23} color={colors.accent} />
        </View>
        <View style={styles.settingCopy}>
          <Text style={[styles.settingTitle, { color: colors.ink }]}>Biometric lock</Text>
          <Text style={[styles.settingBody, { color: colors.muted }]}>Require your fingerprint, face, or device passcode when opening Memory.</Text>
        </View>
        <Switch
          accessibilityLabel="Biometric lock"
          value={lockEnabled}
          onValueChange={(value) => void toggleLock(value)}
          trackColor={{ false: colors.surfaceMuted, true: colors.sage }}
          thumbColor={colors.surfaceElevated}
        />
      </View>

      <SectionHeader title="How your data moves" />
      <View style={[styles.flowCard, { backgroundColor: colors.surface }, !isDark && shadows.card]}>
        {[
          { icon: "mic-outline" as const, title: "Recorded here", body: "Audio begins and stays on your device.", tone: colors.accentSoft, iconColor: colors.accent },
          { icon: "sparkles-outline" as const, title: "Processed temporarily", body: "A secure backend creates the transcript and insights.", tone: colors.surfaceMuted, iconColor: colors.muted },
          { icon: "phone-portrait-outline" as const, title: "Remembered here", body: "The result returns to local SQLite; server copies expire.", tone: colors.sageSoft, iconColor: colors.sage },
        ].map((step, index) => (
          <View key={step.title} style={styles.flowRow}>
            <View style={styles.flowRail}>
              <View style={[styles.flowIcon, { backgroundColor: step.tone }]}><Ionicons name={step.icon} size={20} color={step.iconColor} /></View>
              {index < 2 ? <View style={[styles.flowLine, { backgroundColor: colors.line }]} /> : null}
            </View>
            <View style={styles.flowCopy}>
              <Text style={[styles.flowTitle, { color: colors.ink }]}>{step.title}</Text>
              <Text style={[styles.flowBody, { color: colors.muted }]}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <SectionHeader title="Your control" />
      <View style={[styles.controlCard, { backgroundColor: colors.surface }, !isDark && shadows.card]}>
        <View style={styles.controlRow}>
          <Ionicons name="share-outline" size={21} color={colors.sage} />
          <View style={styles.controlCopy}><Text style={[styles.controlTitle, { color: colors.ink }]}>Export anytime</Text><Text style={[styles.controlBody, { color: colors.muted }]}>Every memory has a readable export option.</Text></View>
        </View>
        <View style={[styles.controlRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
          <Ionicons name="trash-outline" size={21} color={colors.muted} />
          <View style={styles.controlCopy}><Text style={[styles.controlTitle, { color: colors.ink }]}>Delete anytime</Text><Text style={[styles.controlBody, { color: colors.muted }]}>Remove one recording, one memory, or everything.</Text></View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={deleting}
        onPress={confirmDeleteAll}
        style={({ pressed }) => [styles.deleteButton, { backgroundColor: colors.dangerSoft }, pressed && { opacity: 0.65 }]}
      >
        <Ionicons name="trash-outline" size={19} color={colors.danger} />
        <Text style={[styles.deleteText, { color: colors.danger }]}>{deleting ? "Deleting…" : "Delete all local data"}</Text>
      </Pressable>
      <Text style={[styles.footer, { color: colors.faint }]}>Memory AI · No cloud conversation database</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  hero: { alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  shield: { width: 76, height: 76, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1, marginTop: spacing.lg },
  intro: { maxWidth: 340, fontSize: typeScale.body, lineHeight: 22, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.md },
  settingCard: { minHeight: 96, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  settingIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  settingCopy: { flex: 1 },
  settingTitle: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  settingBody: { fontSize: typeScale.caption, lineHeight: 17, marginTop: 3 },
  flowCard: { borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  flowRow: { flexDirection: "row", gap: spacing.sm },
  flowRail: { width: 44, alignItems: "center" },
  flowIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  flowLine: { width: 1, flex: 1, minHeight: 32, marginVertical: 4 },
  flowCopy: { flex: 1, paddingTop: 3, paddingBottom: spacing.lg },
  flowTitle: { fontSize: 15, fontWeight: "800" },
  flowBody: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  controlCard: { borderRadius: radii.lg, paddingHorizontal: spacing.md },
  controlRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  controlCopy: { flex: 1 },
  controlTitle: { fontSize: 15, fontWeight: "700" },
  controlBody: { fontSize: typeScale.caption, lineHeight: 17, marginTop: 2 },
  deleteButton: { minHeight: 54, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.xxl },
  deleteText: { fontSize: 14, fontWeight: "800" },
  footer: { fontSize: 11, textAlign: "center", marginTop: spacing.lg },
});
