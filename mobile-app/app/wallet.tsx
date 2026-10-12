import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createCheckout, getTransactions, runCheckout, summarizeTransactions, verifyPayment, type WalletActivity, type WalletPack } from "../src/services/wallet";
import { useAuthStore } from "../src/store/useAuthStore";
import { useWalletStore } from "../src/store/useWalletStore";
import type { CheckoutOutcome } from "../src/utils/checkoutReturn";
import { formatCents, formatTokens, minutesLabel, tokenCount } from "../src/utils/money";
import { fonts, radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

const POLL_INTERVAL_MS = 2_000;
const POLL_LIMIT_MS = 30_000;

function activityDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const signedIn = useAuthStore((state) => state.status === "signedIn");
  const { wallet, refresh, loading, error } = useWalletStore();
  const [activity, setActivity] = useState<WalletActivity[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!useAuthStore.getState().userId) return;
    const [, transactions] = await Promise.all([refresh(), getTransactions(60).catch(() => [])]);
    setActivity(summarizeTransactions(transactions));
  }, [refresh]);

  const [noticeTone, setNoticeTone] = useState<"success" | "info" | "error">("success");
  const beforeRef = useRef(0);
  const checkoutOpenRef = useRef(false);

  /** After the in-app checkout closes: wait for the webhook to credit the tokens. */
  const settleCheckout = useCallback(async (status: CheckoutOutcome, paymentId: string | null) => {
    if (status === "cancelled") {
      // Closed early: a payment may still have gone through, so take one quick look.
      const next = await refresh();
      setBuying(null);
      if (next && next.balanceMicros > beforeRef.current) {
        setNoticeTone("success");
        setNotice(`Added ${formatTokens(next.balanceMicros - beforeRef.current)} to your wallet.`);
      }
      return;
    }
    if (status === "failed") {
      setBuying(null);
      setNoticeTone("error");
      setNotice("The payment didn't go through. You weren't charged; try another card or method.");
      return;
    }
    const before = beforeRef.current;
    const deadline = Date.now() + POLL_LIMIT_MS;
    if (paymentId) {
      // Confirm with Dodo through our backend; the webhook may arrive later or not at all.
      await verifyPayment(paymentId).catch(() => undefined);
    }
    try {
      while (Date.now() < deadline) {
        const next = await refresh();
        if (next && next.balanceMicros > before) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setNoticeTone("success");
          setNotice(`Added ${formatTokens(next.balanceMicros - before)} to your wallet.`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      setNoticeTone("info");
      setNotice("Payment received. Your tokens will appear in a moment.");
    } finally {
      setBuying(null);
      await load();
    }
  }, [load, refresh]);

  useFocusEffect(useCallback(() => {
    // The Custom Tab returning also refocuses this screen; buy() settles that itself.
    if (!checkoutOpenRef.current) void load();
  }, [load]));

  async function buy(pack: WalletPack): Promise<void> {
    if (buying) return;
    void Haptics.selectionAsync();
    setBuying(pack.id);
    setNotice(null);
    beforeRef.current = wallet?.balanceMicros ?? 0;
    let url: string;
    try {
      url = await createCheckout(pack.id);
    } catch (cause) {
      setBuying(null);
      Alert.alert("Couldn't start checkout", cause instanceof Error ? cause.message : "Please try again.");
      return;
    }
    checkoutOpenRef.current = true;
    try {
      const result = await runCheckout(url, { toolbar: colors.surface, controls: colors.accent });
      await settleCheckout(result.status, result.paymentId);
    } finally {
      checkoutOpenRef.current = false;
    }
  }

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card];

  if (!signedIn) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={[card, styles.center]}>
          <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="wallet-outline" size={28} color={colors.accent} />
          </View>
          <Text style={[styles.signInTitle, { color: colors.ink }]}>Get 5,000 free tokens</Text>
          <Text style={[styles.body, { color: colors.muted, textAlign: "center" }]}>
            Sign in with Google to turn recordings into memories. Tokens pay for transcription and AI, and every new account starts with 5,000.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/cloud" as never)}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.ink }, pressed && styles.pressed]}>
            <Ionicons name="logo-google" size={18} color={colors.background} />
            <Text style={[styles.primaryText, { color: colors.background }]}>Continue with Google</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const packs = wallet?.packs ?? [];
  const bestValue = packs.length > 1 ? packs.reduce((best, pack) => (pack.priceCents > best.priceCents ? pack : best)) : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={loading && wallet != null} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <LinearGradient
        colors={isDark ? ["#123D42", "#10213A"] : [colors.ink, "#1D4E8F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        <Text style={styles.balanceEyebrow}>YOUR TOKENS</Text>
        {wallet ? (
          <>
            <View style={styles.balanceRow}>
              <Text accessibilityRole="header" style={styles.balance}>{tokenCount(wallet.balanceMicros)}</Text>
              <Text style={styles.balanceUnit}>tokens</Text>
            </View>
            <Text style={styles.balanceMeta}>{minutesLabel(wallet.minutesLeft)}</Text>
          </>
        ) : error ? (
          <Text style={styles.balanceMeta}>{error}</Text>
        ) : (
          <ActivityIndicator color="#FFFFFF" style={{ alignSelf: "flex-start", marginVertical: spacing.md }} />
        )}
        {wallet?.lowBalance ? (
          <View style={styles.lowPill}>
            <Ionicons name="alert-circle" size={14} color="#FFFFFF" />
            <Text style={styles.lowText}>Running low. Top up to keep recording.</Text>
          </View>
        ) : null}
      </LinearGradient>

      {notice ? (
        <View style={[styles.notice, { backgroundColor: noticeTone === "error" ? colors.dangerSoft : noticeTone === "info" ? colors.surfaceMuted : colors.accentSoft }]}>
          <Ionicons
            name={noticeTone === "error" ? "alert-circle" : noticeTone === "info" ? "time-outline" : "checkmark-circle"}
            size={18}
            color={noticeTone === "error" ? colors.danger : noticeTone === "info" ? colors.muted : colors.accent}
          />
          <Text style={[styles.noticeText, { color: colors.ink }]}>{notice}</Text>
        </View>
      ) : null}

      <Text style={[styles.section, { color: colors.muted }]}>TOP UP</Text>
      {wallet && !wallet.paymentsEnabled ? (
        <View style={card}>
          <Text style={[styles.body, { color: colors.muted }]}>Top-ups aren't available yet. Your free tokens keep working in the meantime.</Text>
        </View>
      ) : (
        <View style={styles.packs}>
          {packs.map((pack) => {
            const best = bestValue?.id === pack.id;
            return (
              <Pressable
                key={pack.id}
                accessibilityRole="button"
                accessibilityLabel={`Pay ${formatCents(pack.priceCents)} for ${formatTokens(pack.creditMicros)}`}
                disabled={buying != null}
                onPress={() => void buy(pack)}
                style={({ pressed }) => [
                  styles.pack,
                  { backgroundColor: colors.surface, borderColor: best ? colors.accent : colors.line },
                  !isDark && shadows.card,
                  pressed && styles.pressed,
                ]}
              >
                {best ? (
                  <View style={[styles.bestTag, { backgroundColor: colors.accent }]}>
                    <Text style={styles.bestText}>MOST TOKENS</Text>
                  </View>
                ) : null}
                <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.packCredit, { color: colors.ink }]}>{tokenCount(pack.creditMicros)}</Text>
                <Text style={[styles.packLabel, { color: colors.muted }]}>tokens</Text>
                <View style={[styles.packPrice, { backgroundColor: colors.ink }]}>
                  {buying === pack.id
                    ? <ActivityIndicator size="small" color={colors.background} />
                    : <Text style={[styles.packPriceText, { color: colors.background }]}>Pay {formatCents(pack.priceCents)}</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <Text style={[styles.footnote, { color: colors.faint }]}>
        Tokens pay for transcription and AI on each conversation; you're only charged what it actually uses, rounded up to a whole token. Prices are in USD; checkout may show your local currency plus taxes. Payments are handled securely by Dodo Payments.
      </Text>

      <Text style={[styles.section, { color: colors.muted }]}>ACTIVITY</Text>
      <View style={card}>
        {activity.length ? activity.map((item, index) => (
          <View key={item.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
            <View style={[styles.rowIcon, { backgroundColor: item.kind === "credit" ? colors.accentSoft : colors.surfaceMuted }]}>
              <Ionicons
                name={item.kind === "credit" ? "add" : item.kind === "pending" ? "hourglass-outline" : "sparkles-outline"}
                size={16}
                color={item.kind === "credit" ? colors.accent : colors.muted}
              />
            </View>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.ink }]}>{item.title}</Text>
              <Text style={[styles.rowMeta, { color: colors.muted }]}>
                {activityDate(item.createdAt)}{item.kind === "pending" ? " · processing" : ""}
              </Text>
            </View>
            <Text style={[styles.rowAmount, { color: item.amount > 0 ? colors.accent : colors.ink }]}>
              {formatTokens(item.amount, { sign: true })}
            </Text>
          </View>
        )) : (
          <Text style={[styles.body, { color: colors.muted }]}>Charges for each conversation will appear here.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  center: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  bigIcon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  signInTitle: { fontFamily: fonts.display, fontSize: 30, textAlign: "center" },
  body: { fontSize: typeScale.body, lineHeight: 22 },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 52, borderRadius: radii.pill, alignSelf: "stretch", marginTop: spacing.sm },
  primaryText: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  balanceCard: { borderRadius: radii.xl, padding: spacing.lg, gap: 2 },
  balanceEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  balanceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  balance: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 56, lineHeight: 64 },
  balanceUnit: { color: "rgba(255,255,255,0.75)", fontSize: typeScale.bodyLarge, fontWeight: "700" },
  balanceMeta: { color: "rgba(255,255,255,0.85)", fontSize: typeScale.body, fontWeight: "600" },
  lowPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(224,71,76,0.85)", borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, marginTop: spacing.sm },
  lowText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radii.md, padding: spacing.sm },
  noticeText: { flex: 1, fontSize: 14, fontWeight: "700" },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: spacing.md, marginLeft: spacing.xs },
  packs: { flexDirection: "row", gap: spacing.xs },
  pack: { flex: 1, borderRadius: radii.lg, borderWidth: 1.5, paddingHorizontal: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.sm, alignItems: "center" },
  bestTag: { position: "absolute", top: -9, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  bestText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  packCredit: { fontFamily: fonts.display, fontSize: 30 },
  packLabel: { fontSize: 12, fontWeight: "700" },
  packPrice: { alignSelf: "stretch", minHeight: 36, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  packPriceText: { fontSize: 13.5, fontWeight: "800" },
  footnote: { fontSize: 12, lineHeight: 17, marginHorizontal: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 11 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: typeScale.body, fontWeight: "700" },
  rowMeta: { fontSize: 12, marginTop: 1 },
  rowAmount: { fontSize: typeScale.body, fontWeight: "800" },
});
