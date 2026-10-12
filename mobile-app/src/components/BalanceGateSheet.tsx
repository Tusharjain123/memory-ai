import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { WalletSummary } from "../services/wallet";
import { formatTokens, minutesLabel } from "../utils/money";
import { BottomSheet } from "./BottomSheet";
import { fonts, radii, spacing, typeScale, useAppTheme } from "../theme";

export type GateReason = "signin" | "low";

/**
 * Shown before a conversation when processing it wouldn't go through:
 * signed out (needs an account for AI) or a balance too low to cover it.
 * Recording anyway is always allowed; the audio waits on the device.
 */
export function BalanceGateSheet({
  reason,
  wallet,
  busy,
  onClose,
  onPrimary,
  onRecordAnyway,
}: {
  reason: GateReason | null;
  wallet: WalletSummary | null;
  busy?: boolean;
  onClose: () => void;
  onPrimary: () => void;
  onRecordAnyway: () => void;
}) {
  const { colors } = useAppTheme();
  const signin = reason === "signin";
  return (
    <BottomSheet visible={reason != null} onClose={onClose}>
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: signin ? colors.accentSoft : colors.warmSoft }]}>
          <Ionicons name={signin ? "sparkles" : "wallet"} size={26} color={signin ? colors.accent : colors.warm} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {signin ? "Get 5,000 free tokens" : "You're running low on tokens"}
        </Text>
        <Text style={[styles.text, { color: colors.muted }]}>
          {signin
            ? "Sign in with Google to turn this recording into a memory: summary, people and promises. New accounts start with 5,000 tokens."
            : wallet
              ? `You have ${formatTokens(wallet.balanceMicros)} left (${minutesLabel(wallet.minutesLeft).replace("≈ ", "about ")}). Top up so this conversation can be processed.`
              : "Top up so this conversation can be processed."}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onPrimary}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.ink }, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={colors.background} /> : (
            <>
              <Ionicons name={signin ? "logo-google" : "add-circle"} size={18} color={colors.background} />
              <Text style={[styles.primaryText, { color: colors.background }]}>{signin ? "Continue with Google" : "Top up"}</Text>
            </>
          )}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRecordAnyway} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.secondaryText, { color: colors.muted }]}>Record anyway, process later</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.xs },
  icon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, textAlign: "center", marginTop: spacing.xs },
  text: { fontSize: typeScale.body, lineHeight: 22, textAlign: "center" },
  primary: { alignSelf: "stretch", minHeight: 54, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.md },
  primaryText: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  secondary: { minHeight: 44, justifyContent: "center" },
  secondaryText: { fontSize: 15, fontWeight: "700" },
});
