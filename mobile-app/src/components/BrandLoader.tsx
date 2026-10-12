import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { spacing, typeScale, useAppTheme } from "../theme";

const LOGO = require("../../assets/memory-ai-logo.png");

// Five equalizer bars echoing the logo's waveform: phase offsets and peak heights.
const BARS = [
  { phase: 0, peak: 0.55, soft: false },
  { phase: 0.2, peak: 0.8, soft: true },
  { phase: 0.4, peak: 1, soft: false },
  { phase: 0.6, peak: 0.8, soft: true },
  { phase: 0.8, peak: 0.55, soft: false },
];
const BAR_HEIGHT = 22;

/**
 * Memory AI loading screen, drawn natively (crisp at any density, light and
 * dark themes): logo disc, spinning progress arc, breathing halo and an
 * animated waveform. Respects the system "reduce motion" setting.
 */
export function BrandLoader({ label = "Loading your memories", size = 132 }: { label?: string; size?: number }) {
  const { colors, isDark } = useAppTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (reduceMotion) return undefined;
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1_300, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1_100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1_100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.timing(wave, { toValue: 1, duration: 1_000, easing: Easing.linear, useNativeDriver: true })),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [appear, breathe, reduceMotion, spin, wave]);

  const ring = size;
  const disc = Math.round(size * 0.62);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [isDark ? 0.05 : 0.06, isDark ? 0.13 : 0.14] });

  const barScale = (phase: number, peak: number) => {
    if (reduceMotion) return peak * 0.75;
    // Triangle wave shifted by phase: low → peak → low over one cycle.
    const inputRange = [0, 0.25, 0.5, 0.75, 1];
    const at = (t: number) => {
      const x = (((t + phase) % 1) + 1) % 1;
      return 0.28 + (peak - 0.28) * (x < 0.5 ? x * 2 : (1 - x) * 2);
    };
    return wave.interpolate({ inputRange, outputRange: inputRange.map(at) });
  };

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.page, { backgroundColor: colors.background }]}
    >
      <Animated.View
        style={{
          alignItems: "center",
          opacity: appear,
          transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }}
      >
        <View style={{ width: ring * 1.3, height: ring * 1.3, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={[
              styles.circle,
              {
                width: ring * 1.1,
                height: ring * 1.1,
                borderRadius: ring,
                backgroundColor: colors.accent,
                opacity: reduceMotion ? 0.08 : haloOpacity,
                transform: [{ scale: reduceMotion ? 1 : haloScale }],
              },
            ]}
          />
          <View style={[styles.circle, { width: ring, height: ring, borderRadius: ring / 2, borderWidth: 2, borderColor: isDark ? "rgba(255,255,255,0.10)" : colors.line }]} />
          <Animated.View
            style={[
              styles.circle,
              {
                width: ring,
                height: ring,
                borderRadius: ring / 2,
                borderWidth: 3,
                borderColor: "transparent",
                borderTopColor: colors.accent,
                borderRightColor: colors.accent,
                transform: [{ rotate: reduceMotion ? "45deg" : rotate }],
              },
            ]}
          />
          <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2 }]}>
            <Image source={LOGO} resizeMode="cover" style={{ width: disc * 1.04, height: disc * 1.04 }} />
          </View>
        </View>

        <Text style={[styles.wordmark, { color: colors.ink }]}>
          Memory <Text style={{ color: colors.accent }}>AI</Text>
        </Text>

        <View style={styles.wave} importantForAccessibility="no-hide-descendants">
          {BARS.map((bar, index) => (
            <Animated.View
              key={index}
              style={[
                styles.bar,
                {
                  backgroundColor: colors.accent,
                  opacity: bar.soft ? 0.45 : 1,
                  transform: [{ scaleY: barScale(bar.phase, bar.peak) }],
                },
              ]}
            />
          ))}
        </View>

        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  circle: { position: "absolute" },
  disc: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#F5FBFA",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  wordmark: { fontSize: typeScale.title2, fontWeight: "800", letterSpacing: -0.6, marginTop: spacing.sm },
  wave: { flexDirection: "row", alignItems: "center", gap: 5, height: BAR_HEIGHT, marginTop: spacing.md },
  bar: { width: 5, height: BAR_HEIGHT, borderRadius: 3 },
  label: { fontSize: typeScale.body, marginTop: spacing.md, textAlign: "center" },
});
