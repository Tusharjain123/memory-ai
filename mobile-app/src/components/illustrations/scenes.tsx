import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { radii, useAppTheme } from "../../theme";
import { floatStyle, SceneGlow, useCycle, useLoop, useReduceMotion } from "./motion";

type SceneProps = { size?: number; animated?: boolean };

/* ---------- shared bits ---------- */

/** Small floating card with an icon tile and a line of text. */
function Chip({
  icon,
  label,
  tone = "accent",
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: "accent" | "warm" | "ink";
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useAppTheme();
  const tile = tone === "warm" ? colors.warmSoft : tone === "ink" ? colors.surfaceMuted : colors.accentSoft;
  const ink = tone === "warm" ? colors.warm : tone === "ink" ? colors.ink : colors.accent;
  return (
    <Animated.View
      style={[
        styles.chip,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.line },
        !isDark && styles.chipShadow,
        style,
      ]}
    >
      <View style={[styles.chipIcon, { backgroundColor: tile }]}>
        <Ionicons name={icon} size={13} color={ink} />
      </View>
      <Text numberOfLines={1} style={[styles.chipText, { color: colors.ink }]}>{label}</Text>
    </Animated.View>
  );
}

function Stage({ size, children, glow, ratio = 0.86 }: { size: number; children: ReactNode; glow?: string; ratio?: number }) {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size * ratio, alignItems: "center", justifyContent: "center" }}>
      <SceneGlow size={size * 0.95} {...(glow ? { color: glow } : {})} />
      {children}
    </View>
  );
}

/* ---------- Capture: mic + waveform with memories floating out ---------- */

const WAVE = [0.35, 0.6, 0.9, 0.55, 1, 0.7, 0.4, 0.8, 0.5, 0.3];

export function CaptureScene({ size = 300, animated = true }: SceneProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const a = useLoop(3200, motion);
  const b = useLoop(3800, motion, 0.2);
  const c = useLoop(3000, motion, 0.8);
  const wave = useCycle(1400, motion);
  const disc = size * 0.34;

  return (
    <Stage size={size} ratio={0.95}>
      <View style={{ alignItems: "center" }}>
        <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: colors.accent }]}>
          <Ionicons name="mic" size={disc * 0.42} color="#FFFFFF" />
        </View>
        <View style={[styles.waveRow, { marginTop: size * 0.05 }]}>
          {WAVE.map((peak, index) => (
            <Animated.View
              key={index}
              style={{
                width: 5,
                height: 26,
                marginHorizontal: 2.5,
                borderRadius: 3,
                backgroundColor: index % 2 ? colors.accent : colors.ink,
                opacity: index % 2 ? 1 : 0.85,
                transform: [{
                  scaleY: motion
                    ? wave.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: index % 2 ? [peak, 0.3, peak] : [0.3, peak, 0.3],
                    })
                    : peak * 0.8,
                }],
              }}
            />
          ))}
        </View>
      </View>
      <Chip icon="document-text" label="Summary ready" style={[styles.abs, { top: 0, left: -size * 0.04 }, floatStyle(a)]} />
      <Chip icon="checkmark-circle" label="Send deck by Fri" tone="warm" style={[styles.abs, { bottom: size * 0.2, right: -size * 0.1 }, floatStyle(b, 5)]} />
      <Chip icon="person" label="Priya · 3 chats" tone="ink" style={[styles.abs, { bottom: 0, left: size * 0.02 }, floatStyle(c, 7)]} />
    </Stage>
  );
}

/* ---------- Memory cards: a sample memory assembling itself ---------- */

export function MemoryCardsScene({ size = 300, animated = true }: SceneProps) {
  const { colors, isDark } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const steps = useRef([0, 1, 2].map(() => new Animated.Value(motion ? 0 : 1))).current;

  useEffect(() => {
    if (!motion) {
      steps.forEach((step) => step.setValue(1));
      return undefined;
    }
    steps.forEach((step) => step.setValue(0));
    const run = Animated.stagger(520, steps.map((step) => Animated.spring(step, { toValue: 1, damping: 14, stiffness: 140, useNativeDriver: true })));
    run.start();
    return () => run.stop();
  }, [motion, steps]);

  const enter = (step: Animated.Value) => ({
    opacity: step,
    transform: [
      { translateY: step.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      { scale: step.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  });
  const width = size * 0.9;
  const card = [styles.card, { width, backgroundColor: colors.surfaceElevated, borderColor: colors.line }, !isDark && styles.chipShadow];

  return (
    <Stage size={size}>
      <View style={{ gap: 10, alignItems: "center" }}>
        <Animated.View style={[card, enter(steps[0]!)]}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="mic" size={14} color={colors.accent} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Coffee with Priya</Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>18 min</Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.muted }]}>
            Talked through the launch plan, pricing worries and who owns the deck.
          </Text>
        </Animated.View>
        <Animated.View style={[card, { width: width * 0.92 }, enter(steps[1]!)]}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: colors.warmSoft }]}>
              <Ionicons name="flag" size={13} color={colors.warm} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>You promised</Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.ink }]}>Send Priya the deck by Friday</Text>
        </Animated.View>
        <Animated.View style={[card, styles.personCard, { width: width * 0.84 }, enter(steps[2]!)]}>
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>P</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Priya Sharma</Text>
            <Text style={[styles.personMeta, { color: colors.muted }]}>3 chats · loves oat flat whites</Text>
          </View>
        </Animated.View>
      </View>
    </Stage>
  );
}

/* ---------- Privacy: phone with a shield, everything stays inside ---------- */

export function PrivacyScene({ size = 300, animated = true }: SceneProps) {
  const { colors, isDark } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const breathe = useLoop(2800, motion);
  const a = useLoop(3400, motion, 0.3);
  const b = useLoop(3000, motion, 0.7);
  const w = size * 0.42;
  const h = w * 1.7;

  return (
    <Stage size={size}>
      <Svg width={w} height={h} viewBox="0 0 120 204">
        <Rect x="3" y="3" width="114" height="198" rx="22" fill={colors.surfaceElevated} stroke={colors.ink} strokeOpacity={isDark ? 0.5 : 0.85} strokeWidth="4" />
        <Rect x="44" y="12" width="32" height="7" rx="3.5" fill={colors.ink} opacity={0.75} />
        <Rect x="18" y="150" width="84" height="9" rx="4.5" fill={colors.line} />
        <Rect x="18" y="166" width="58" height="9" rx="4.5" fill={colors.line} />
      </Svg>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { transform: [{ translateY: -h * 0.12 }, { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] }) }] }]}>
        <Svg width={w * 0.78} height={w * 0.86} viewBox="0 0 100 110">
          <Path d="M50 6 L88 20 V50 C88 76 71 95 50 104 C29 95 12 76 12 50 V20 Z" fill={colors.accent} />
          <Path d="M50 6 L88 20 V50 C88 76 71 95 50 104 Z" fill="#FFFFFF" opacity={0.14} />
          <Path d="M33 54 L45 66 L68 42" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Animated.View>
      <Chip icon="phone-portrait" label="Stored on this phone" style={[styles.abs, { top: size * 0.08, left: -size * 0.02 }, floatStyle(a)]} />
      <Chip icon="lock-closed" label="App lock" tone="warm" style={[styles.abs, { bottom: size * 0.1, right: -size * 0.02 }, floatStyle(b, 5)]} />
    </Stage>
  );
}

/* ---------- Calendar: a page with today circled and a video badge ---------- */

export function CalendarScene({ size = 300, animated = true }: SceneProps) {
  const { colors, isDark } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const a = useLoop(3200, motion);
  const b = useLoop(3600, motion, 0.8);
  const w = size * 0.62;
  const cells = Array.from({ length: 15 }, (_, index) => index);

  return (
    <Stage size={size}>
      <Svg width={w} height={w * 0.9} viewBox="0 0 180 162">
        <Rect x="4" y="12" width="172" height="146" rx="22" fill={colors.surfaceElevated} stroke={colors.line} strokeWidth="3" />
        <Path d="M4 34 C4 22 13 12 26 12 H154 C167 12 176 22 176 34 V46 H4 Z" fill={colors.accent} />
        <Rect x="44" y="2" width="10" height="24" rx="5" fill={colors.ink} opacity={isDark ? 0.8 : 1} />
        <Rect x="126" y="2" width="10" height="24" rx="5" fill={colors.ink} opacity={isDark ? 0.8 : 1} />
        <G>
          {cells.map((index) => {
            const col = index % 5;
            const row = Math.floor(index / 5);
            const cx = 30 + col * 30;
            const cy = 74 + row * 28;
            const today = index === 7;
            return today ? (
              <G key={index}>
                <Circle cx={cx} cy={cy} r={12} fill={colors.warm} />
                <Circle cx={cx} cy={cy} r={4} fill="#FFFFFF" />
              </G>
            ) : (
              <Circle key={index} cx={cx} cy={cy} r={index % 4 === 1 ? 5 : 4} fill={index % 4 === 1 ? colors.accent : colors.line} />
            );
          })}
        </G>
      </Svg>
      <Animated.View style={[styles.abs, styles.badge, { top: size * 0.05, right: size * 0.1, backgroundColor: colors.ink }, floatStyle(a, 5)]}>
        <Ionicons name="videocam" size={20} color={colors.background} />
      </Animated.View>
      <Chip icon="time" label="Up next · 10:30" style={[styles.abs, { bottom: size * 0.04, left: size * 0.02 }, floatStyle(b)]} />
    </Stage>
  );
}

/* ---------- People: a small constellation of faces ---------- */

const FACES = [
  { initial: "P", x: 0.5, y: 0.42, r: 0.15, tint: "accent" },
  { initial: "A", x: 0.22, y: 0.3, r: 0.1, tint: "warm" },
  { initial: "L", x: 0.78, y: 0.28, r: 0.11, tint: "ink" },
  { initial: "S", x: 0.3, y: 0.7, r: 0.09, tint: "ink" },
  { initial: "K", x: 0.74, y: 0.68, r: 0.1, tint: "accent" },
] as const;

export function PeopleScene({ size = 280, animated = true }: SceneProps) {
  const { colors, isDark } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const loops = [useLoop(3400, motion, 0.5), useLoop(3000, motion, 0.2), useLoop(3800, motion, 0.8), useLoop(3200, motion, 0.4), useLoop(3600, motion, 0.6)];
  const h = size * 0.86;
  const fill = (tint: string) => (tint === "warm" ? colors.warmSoft : tint === "ink" ? colors.surfaceMuted : colors.accentSoft);
  const ink = (tint: string) => (tint === "warm" ? colors.warm : tint === "ink" ? colors.ink : colors.accent);

  return (
    <Stage size={size}>
      <Svg width={size} height={h} style={StyleSheet.absoluteFill}>
        {FACES.slice(1).map((face) => (
          <Path
            key={face.initial}
            d={`M${size * 0.5} ${h * 0.42} L${size * face.x} ${h * face.y}`}
            stroke={colors.accent}
            strokeOpacity={isDark ? 0.35 : 0.25}
            strokeWidth={2}
            strokeDasharray="4 6"
          />
        ))}
      </Svg>
      {FACES.map((face, index) => {
        const d = size * face.r * 2;
        return (
          <Animated.View
            key={face.initial}
            style={[
              styles.abs,
              styles.face,
              {
                width: d,
                height: d,
                borderRadius: d / 2,
                left: size * face.x - d / 2,
                top: h * face.y - d / 2,
                backgroundColor: fill(face.tint),
                borderColor: colors.surfaceElevated,
              },
              floatStyle(loops[index]!, index === 0 ? 3 : 5),
            ]}
          >
            <Text style={{ color: ink(face.tint), fontSize: d * 0.38, fontWeight: "800" }}>{face.initial}</Text>
          </Animated.View>
        );
      })}
      <Chip icon="heart" label="Remembers what matters" tone="warm" style={[styles.abs, { bottom: 0 }]} />
    </Stage>
  );
}

/* ---------- Mic: rings rippling out from a mic ---------- */

function Ripple({ size, delay, enabled, color }: { size: number; delay: number; enabled: boolean; color: string }) {
  const cycle = useCycle(2400, enabled, delay);
  return (
    <Animated.View
      style={[
        styles.abs,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
          opacity: cycle.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.6, 0] }),
          transform: [{ scale: cycle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
        },
      ]}
    />
  );
}

export function MicScene({ size = 300, animated = true }: SceneProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const disc = size * 0.32;
  const a = useLoop(3200, motion, 0.3);

  return (
    <Stage size={size}>
      {[0, 800, 1600].map((delay) => (
        <Ripple key={delay} size={size * 0.78} delay={delay} enabled={motion} color={colors.accent} />
      ))}
      <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: colors.accent }]}>
        <Ionicons name="mic" size={disc * 0.44} color="#FFFFFF" />
      </View>
      <Chip icon="hand-left" label="Only when you tap" tone="warm" style={[styles.abs, { bottom: size * 0.04 }, floatStyle(a, 5)]} />
    </Stage>
  );
}

/* ---------- Celebrate: a badge with twinkling sparkles ---------- */

const SPARKS = [
  { x: 0.14, y: 0.18, s: 26, d: 0 },
  { x: 0.78, y: 0.12, s: 20, d: 300 },
  { x: 0.82, y: 0.62, s: 28, d: 700 },
  { x: 0.1, y: 0.68, s: 18, d: 1000 },
  { x: 0.48, y: 0.0, s: 15, d: 500 },
  { x: 0.62, y: 0.8, s: 14, d: 1300 },
];

function Spark({ size, x, y, s, delay, enabled, color }: { size: number; x: number; y: number; s: number; delay: number; enabled: boolean; color: string }) {
  const cycle = useCycle(1800, enabled, delay);
  return (
    <Animated.View
      style={[
        styles.abs,
        {
          left: size * x,
          top: size * 0.86 * y,
          opacity: enabled ? cycle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 1, 0.2] }) : 0.9,
          transform: [{ scale: enabled ? cycle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.1, 0.6] }) : 1 }],
        },
      ]}
    >
      <Svg width={s} height={s} viewBox="0 0 20 20">
        <Path d="M10 0 C11 6 14 9 20 10 C14 11 11 14 10 20 C9 14 6 11 0 10 C6 9 9 6 10 0 Z" fill={color} />
      </Svg>
    </Animated.View>
  );
}

export function CelebrateScene({ size = 260, animated = true }: SceneProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const pop = useRef(new Animated.Value(motion ? 0 : 1)).current;
  useEffect(() => {
    if (!motion) return undefined;
    const run = Animated.spring(pop, { toValue: 1, damping: 9, stiffness: 120, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [motion, pop]);
  const disc = size * 0.36;

  return (
    <Stage size={size} glow={colors.warm}>
      {SPARKS.map((spark, index) => (
        <Spark key={index} size={size} x={spark.x} y={spark.y} s={spark.s} delay={spark.d} enabled={motion} color={index % 2 ? colors.warm : colors.accent} />
      ))}
      <Animated.View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: colors.accent, transform: [{ scale: pop }] }]}>
        <Ionicons name="bookmark" size={disc * 0.42} color="#FFFFFF" />
      </Animated.View>
    </Stage>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  center: { alignItems: "center", justifyContent: "center" },
  disc: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B8E7D",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  waveRow: { flexDirection: "row", alignItems: "center", height: 30 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 12,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipShadow: {
    shadowColor: "#12346B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  chipIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 12.5, fontWeight: "700" },
  card: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "800", flexShrink: 1 },
  cardMeta: { fontSize: 12, marginLeft: "auto" },
  personMeta: { fontSize: 12, marginTop: 2 },
  cardBody: { fontSize: 13, lineHeight: 18 },
  personCard: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "800" },
  face: { alignItems: "center", justifyContent: "center", borderWidth: 3 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
