import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fonts, radii, shadows, spacing, typeScale, useAppTheme } from "../theme";

export type ChecklistItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  done: boolean;
  onPress: () => void;
};

function ProgressRing({ done, total, size = 46 }: { done: number; total: number; size?: number }) {
  const { colors, isDark } = useAppTheme();
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={isDark ? "rgba(255,255,255,0.12)" : colors.line} strokeWidth={stroke} fill="none" />
        {done > 0 ? <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - done / total)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        /> : null}
      </Svg>
      <Text style={[styles.ringText, { color: colors.ink }]}>{done}/{total}</Text>
    </View>
  );
}

/** First-week checklist on Home; each item ticks itself off from real data. */
export function GettingStartedCard({ items, onDismiss }: { items: ChecklistItem[]; onDismiss: () => void }) {
  const { colors, isDark } = useAppTheme();
  const done = items.filter((item) => item.done).length;
  const next = items.find((item) => !item.done);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card]}>
      <View style={styles.head}>
        <ProgressRing done={done} total={items.length} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.ink }]}>Getting to know you</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {next ? `Next: ${next.label.toLowerCase()}` : "All done. Memory is all yours."}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Hide getting started" hitSlop={10} onPress={onDismiss}>
          <Ionicons name="close" size={20} color={colors.faint} />
        </Pressable>
      </View>
      <View style={styles.list}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={`${item.label}${item.done ? ", done" : ""}`}
            disabled={item.done}
            onPress={item.onPress}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.check, item.done ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.line }]}>
              {item.done ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : <Ionicons name={item.icon} size={13} color={colors.muted} />}
            </View>
            <Text style={[styles.rowText, { color: item.done ? colors.faint : colors.ink }, item.done && styles.struck]}>{item.label}</Text>
            {item.done ? null : <Ionicons name="chevron-forward" size={16} color={colors.faint} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, marginTop: spacing.lg },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ringText: { fontSize: 11, fontWeight: "800" },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  subtitle: { fontSize: typeScale.caption + 1, marginTop: 1 },
  list: { marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 42 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontSize: typeScale.body, fontWeight: "700" },
  struck: { textDecorationLine: "line-through" },
});
