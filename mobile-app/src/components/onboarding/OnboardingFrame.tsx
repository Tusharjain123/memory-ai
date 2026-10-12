import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, radii, spacing, typeScale, useAppTheme } from "../../theme";

export type FrameAction = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  disabled?: boolean;
};

/**
 * Shared chrome for every onboarding step: soft gradient, progress, back/skip,
 * an editorial headline, the step's own content and one primary action.
 */
export function OnboardingFrame({
  stepKey,
  progress,
  onBack,
  onSkip,
  eyebrow,
  title,
  body,
  art,
  children,
  primary,
  secondary,
}: {
  stepKey: string;
  progress: number;
  onBack?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
  eyebrow?: string | undefined;
  title: string;
  body?: string | undefined;
  art?: ReactNode;
  children?: ReactNode;
  primary: FrameAction;
  secondary?: FrameAction | undefined;
}) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const enter = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter, stepKey]);

  useEffect(() => {
    Animated.timing(bar, { toValue: progress, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [bar, progress]);

  const slide = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[isDark ? "#0E2A36" : colors.accentSoft, colors.background]}
        locations={[0, 0.62]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={[styles.topRow, { paddingTop: insets.top + spacing.xs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            disabled={!onBack}
            onPress={onBack}
            hitSlop={10}
            style={[styles.iconButton, { opacity: onBack ? 1 : 0 }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={[styles.track, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(18,52,107,0.08)" }]}
          >
            <Animated.View
              style={[
                styles.fill,
                { backgroundColor: colors.accent, width: bar.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
              ]}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip setup"
            disabled={!onSkip}
            onPress={onSkip}
            hitSlop={10}
            style={[styles.skip, { opacity: onSkip ? 1 : 0 }]}
          >
            <Text style={[styles.skipText, { color: colors.muted }]}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.body, slide]}>
            {art ? <View style={styles.art}>{art}</View> : null}
            {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text> : null}
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{title}</Text>
            {body ? <Text style={[styles.lede, { color: colors.muted }]}>{body}</Text> : null}
            {children ? <View style={styles.children}>{children}</View> : null}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: primary.disabled || primary.busy, busy: primary.busy }}
            disabled={primary.disabled || primary.busy}
            onPress={primary.onPress}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.ink, opacity: primary.disabled ? 0.45 : 1 },
              pressed && styles.pressed,
            ]}
          >
            {primary.busy ? <ActivityIndicator color={colors.background} /> : (
              <>
                <Text style={[styles.primaryText, { color: colors.background }]}>{primary.label}</Text>
                <Ionicons name={primary.icon ?? "arrow-forward"} size={19} color={colors.background} />
              </>
            )}
          </Pressable>
          {secondary ? (
            <Pressable
              accessibilityRole="button"
              disabled={secondary.disabled}
              onPress={secondary.onPress}
              hitSlop={8}
              style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.secondaryText, { color: colors.muted }]}>{secondary.label}</Text>
            </Pressable>
          ) : <View style={styles.secondary} />}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  skip: { minWidth: 40, height: 40, alignItems: "flex-end", justifyContent: "center" },
  skipText: { fontSize: 15, fontWeight: "700" },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  body: { alignItems: "stretch" },
  art: { alignItems: "center", marginBottom: spacing.lg },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: spacing.xs },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.4 },
  lede: { fontSize: typeScale.bodyLarge, lineHeight: 25, marginTop: spacing.sm },
  children: { marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: 2 },
  primary: {
    minHeight: 58,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  primaryText: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 15, fontWeight: "700" },
});
