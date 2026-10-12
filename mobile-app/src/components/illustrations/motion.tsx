import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useAppTheme } from "../../theme";

/** Tracks the system "reduce motion" setting. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

/**
 * A 0 → 1 → 0 sine loop. Stays at `rest` when motion is off, so
 * illustrations still render a sensible still frame.
 */
export function useLoop(duration: number, enabled: boolean, rest = 0.5): Animated.Value {
  const value = useRef(new Animated.Value(rest)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(rest);
      return undefined;
    }
    value.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [duration, enabled, rest, value]);
  return value;
}

/** Linear 0 → 1 repeating loop (ripples, waves). */
export function useCycle(duration: number, enabled: boolean, delay = 0): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(0.35);
      return undefined;
    }
    value.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [delay, duration, enabled, value]);
  return value;
}

/** Vertical bob for a floating element. */
export function floatStyle(loop: Animated.Value, distance = 6) {
  return { transform: [{ translateY: loop.interpolate({ inputRange: [0, 1], outputRange: [distance, -distance] }) }] };
}

/** Soft radial glow every scene sits on. */
export function SceneGlow({ size, color }: { size: number; color?: string }) {
  const { colors, isDark } = useAppTheme();
  const tint = color ?? colors.accent;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity={isDark ? 0.28 : 0.22} />
            <Stop offset="0.6" stopColor={tint} stopOpacity={isDark ? 0.08 : 0.07} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#glow)" />
      </Svg>
    </View>
  );
}
