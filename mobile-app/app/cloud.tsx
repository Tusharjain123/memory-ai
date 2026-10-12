import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { getCreditBalance } from "../src/services/apiFetch";
import {
  connectGoogle,
  disableCloudStorage,
  disconnectGoogle,
  enableCloudStorage,
} from "../src/services/cloudAuth";
import { syncFolders } from "../src/services/folderSync";
import { connectCalendar, disconnectCalendar } from "../src/services/googleWorkspace";
import { useAuthStore } from "../src/store/useAuthStore";
import { relativeDate } from "../src/utils/format";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";
import { formatTokens } from "../src/utils/money";

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Please try again.";
}

export default function CloudScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const { status, email, cloudSyncEnabled, syncing, lastSyncedAt, syncError, calendarStatus, calendarEmail } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    if (status !== "signedIn") return;
    void getCreditBalance().then(setCredits).catch(() => setCredits(null));
  }, [status]));

  async function run(task: () => Promise<unknown>, failureTitle: string): Promise<void> {
    setBusy(true);
    try {
      await task();
    } catch (cause) {
      Alert.alert(failureTitle, errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function connect(): void {
    void run(async () => {
      if (await connectGoogle()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, "Couldn’t connect Google");
  }

  function toggleCloud(next: boolean): void {
    if (next) {
      Alert.alert(
        "Store your data in the cloud?",
        "Your folders, the memories linked to them, and your profile details (age, gender, phone) will be saved to your account so they’re backed up. Recordings and transcripts stay on this device.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Turn on", onPress: () => void run(enableCloudStorage, "Cloud storage wasn’t turned on") },
        ],
      );
      return;
    }
    Alert.alert(
      "Stop storing data in the cloud?",
      "Nothing on this device is deleted. Choose what happens to the copy already in your account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Keep cloud copy", onPress: () => void run(() => disableCloudStorage({ deleteCloudCopy: false }), "Cloud storage wasn’t changed") },
        { text: "Delete cloud copy", style: "destructive", onPress: () => void run(() => disableCloudStorage({ deleteCloudCopy: true }), "Cloud copy wasn’t deleted") },
      ],
    );
  }

  function connectMeetings(): void {
    void run(async () => {
      if (await connectCalendar()) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push("/calendar" as never);
      }
    }, "Couldn’t connect Google Calendar");
  }

  function disconnectMeetings(): void {
    Alert.alert("Disconnect Calendar & Meet?", "Memory AI stops reading your calendar. Meetings you already imported stay on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => void run(disconnectCalendar, "Couldn’t disconnect Calendar") },
    ]);
  }

  function disconnect(): void {
    Alert.alert("Disconnect Google?", "You’ll be signed out of cloud features. Every memory, folder and setting on this device stays.", [
      { text: "Stay connected", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => void run(disconnectGoogle, "Couldn’t disconnect") },
    ]);
  }

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card];

  if (status === "unavailable") {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <View style={card}>
          <Text style={[styles.title, { color: colors.ink }]}>Cloud features aren’t available</Text>
          <Text style={[styles.body, { color: colors.muted }]}>This build of Memory AI runs fully on your device. Everything works without an account.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="cloud-outline" size={32} color={colors.accent} />
        </View>
        <Text style={[styles.heading, { color: colors.ink }]}>Cloud is optional</Text>
        <Text style={[styles.intro, { color: colors.muted }]}>
          Memory AI works fully without an account. Connect Google only if you want backup and credits.
        </Text>
      </View>

      {status === "signedIn" ? (
        <>
          <View style={card}>
            <View style={styles.row}>
              <Ionicons name="logo-google" size={22} color={colors.ink} />
              <View style={styles.copy}>
                <Text style={[styles.title, { color: colors.ink }]}>Connected</Text>
                <Text numberOfLines={1} style={[styles.body, { color: colors.muted }]}>{email ?? "Google account"}</Text>
              </View>
            </View>
          </View>

          <View style={card}>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={[styles.title, { color: colors.ink }]}>Store my data in the cloud</Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {cloudSyncEnabled
                    ? "On: folders and profile details are backed up to your account."
                    : "Off: nothing beyond your sign-in and credits is stored in the cloud."}
                </Text>
              </View>
              {busy ? <ActivityIndicator color={colors.accent} /> : (
                <Switch
                  accessibilityLabel="Store my data in the cloud"
                  value={cloudSyncEnabled}
                  onValueChange={toggleCloud}
                  trackColor={{ false: colors.surfaceMuted, true: colors.sage }}
                  thumbColor={colors.surfaceElevated}
                />
              )}
            </View>
            {cloudSyncEnabled ? (
              <View style={[styles.syncRow, { borderTopColor: colors.line }]}>
                <Text style={[styles.body, styles.copy, { color: syncError ? colors.danger : colors.muted }]}>
                  {syncing ? "Syncing…" : syncError ? `Last sync failed: ${syncError}` : lastSyncedAt ? `Synced ${relativeDate(lastSyncedAt)}` : "Not synced yet"}
                </Text>
                <Pressable accessibilityRole="button" disabled={syncing} onPress={() => void syncFolders().catch(() => undefined)} hitSlop={8}>
                  <Text style={[styles.link, { color: colors.accent }]}>Sync now</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={card}>
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={22} color={colors.accent} />
              <View style={styles.copy}>
                <Text style={[styles.title, { color: colors.ink }]}>Google Calendar & Meet</Text>
                <Text style={[styles.body, { color: calendarStatus === "expired" ? colors.danger : colors.muted }]}>
                  {calendarStatus === "connected"
                    ? `Reading meetings${calendarEmail ? ` from ${calendarEmail}` : ""}. Read-only.`
                    : calendarStatus === "expired"
                      ? "Google access expired. Reconnect to keep importing."
                      : "Import Google Meet transcripts and link recordings to calendar events. Read-only."}
                </Text>
              </View>
            </View>
            <View style={[styles.syncRow, { borderTopColor: colors.line }]}>
              {calendarStatus === "connected" ? (
                <>
                  <Pressable accessibilityRole="button" onPress={() => router.push("/calendar" as never)} hitSlop={8} style={styles.copy}>
                    <Text style={[styles.link, { color: colors.accent }]}>View meetings</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={busy} onPress={disconnectMeetings} hitSlop={8}>
                    <Text style={[styles.link, { color: colors.danger }]}>Disconnect</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable accessibilityRole="button" disabled={busy} onPress={connectMeetings} hitSlop={8} style={styles.copy}>
                  <Text style={[styles.link, { color: colors.accent }]}>{calendarStatus === "expired" ? "Reconnect" : "Connect Calendar & Meet"}</Text>
                </Pressable>
              )}
            </View>
          </View>

          <Pressable accessibilityRole="button" onPress={() => router.push("/wallet" as never)} style={({ pressed }) => [card, pressed && { opacity: 0.7 }]}>
            <View style={styles.row}>
              <Ionicons name="wallet-outline" size={22} color={colors.accent} />
              <View style={styles.copy}>
                <Text style={[styles.title, { color: colors.ink }]}>Tokens</Text>
                <Text style={[styles.body, { color: colors.muted }]}>{credits == null ? "Balance unavailable" : `${formatTokens(credits)} · Top up or see usage`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </View>
          </Pressable>

          <Pressable accessibilityRole="button" disabled={busy} onPress={disconnect} style={({ pressed }) => [styles.secondary, { borderColor: colors.line }, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.secondaryText, { color: colors.danger }]}>Disconnect Google</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={busy || status === "loading"}
            onPress={connect}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.ink }, pressed && { opacity: 0.8 }]}
          >
            {busy ? <ActivityIndicator color={colors.background} /> : <Ionicons name="logo-google" size={19} color={colors.background} />}
            <Text style={[styles.primaryText, { color: colors.background }]}>Connect Google</Text>
          </Pressable>
          <Text style={[styles.note, { color: colors.faint }]}>
            Connecting creates your account with your Google name and email. Cloud storage stays off until you turn it on.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  hero: { alignItems: "center", paddingVertical: spacing.lg },
  heroIcon: { width: 68, height: 68, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: typeScale.title2, fontWeight: "800", marginTop: spacing.md },
  intro: { fontSize: typeScale.body, lineHeight: 21, textAlign: "center", marginTop: spacing.xs, maxWidth: 320 },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  copy: { flex: 1 },
  title: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  body: { fontSize: typeScale.caption, lineHeight: 18, marginTop: 2 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.sm },
  link: { fontSize: 14, fontWeight: "800" },
  primary: { minHeight: 54, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  primaryText: { fontSize: 15, fontWeight: "800" },
  secondary: { minHeight: 50, borderWidth: 1, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 14, fontWeight: "800" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: spacing.md },
});
