import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { authenticateApp, isBiometricLockEnabled } from "../services/privacy";
import { useRecordingStore } from "../store/useRecordingStore";
import { radii, spacing, typeScale, useAppTheme } from "../theme";

export function AppLock({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const recordingStatus = useRecordingStore((state) => state.status);
  const [locked, setLocked] = useState<boolean | null>(null);
  const recordingActive =
    recordingStatus === "recording" ||
    recordingStatus === "paused" ||
    recordingStatus === "processing";

  async function check(): Promise<void> {
    const enabled = await isBiometricLockEnabled();
    if (!enabled) {
      setLocked(false);
      return;
    }
    setLocked(true);
    if (await authenticateApp()) setLocked(false);
  }

  useEffect(() => {
    void check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "background") return;
      const status = useRecordingStore.getState().status;
      if (status === "recording" || status === "paused" || status === "processing") {
        return;
      }
      void isBiometricLockEnabled().then(setLocked);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (recordingActive && locked) setLocked(false);
  }, [locked, recordingActive]);

  if (locked === null) return <View style={[styles.page, { backgroundColor: colors.background }]} />;
  if (locked && !recordingActive) {
    return (
      <View style={[styles.page, { backgroundColor: colors.background }]}>
        <View style={[styles.mark, { backgroundColor: colors.sageSoft }]}>
          <Ionicons name="lock-closed" size={31} color={colors.sage} />
        </View>
        <Text style={[styles.title, { color: colors.ink }]}>Memory is locked</Text>
        <Text style={[styles.text, { color: colors.muted }]}>Your private second brain is protected on this device.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unlock Memory"
          style={({ pressed }) => [styles.button, { backgroundColor: colors.ink }, pressed && { opacity: 0.75 }]}
          onPress={() => void check()}
        >
          <Ionicons name="finger-print" size={21} color={colors.background} />
          <Text style={[styles.buttonText, { color: colors.background }]}>Unlock Memory</Text>
        </Pressable>
        <Text style={[styles.private, { color: colors.sage }]}>Stored only on this device</Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  mark: { width: 76, height: 76, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  title: { fontSize: typeScale.title2, fontWeight: "800", marginTop: spacing.xl },
  text: { maxWidth: 300, fontSize: typeScale.body, lineHeight: 22, textAlign: "center", marginTop: spacing.xs },
  button: { minWidth: 200, minHeight: 56, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.xxl },
  buttonText: { fontSize: typeScale.body, fontWeight: "800" },
  private: { fontSize: typeScale.caption, fontWeight: "700", marginTop: spacing.lg },
});
