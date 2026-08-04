import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { radii, shadows, spacing, type AppColors, typeScale, useAppTheme } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function PrivacyPill({ compact = false }: { compact?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.privacyPill, { backgroundColor: colors.sageSoft }]}
      accessibilityLabel="Private. Stored only on this device"
    >
      <Ionicons name="lock-closed" size={compact ? 12 : 14} color={colors.sage} />
      <Text style={[styles.privacyText, { color: colors.sage }]}>
        {compact ? "On device" : "Stored only on this device"}
      </Text>
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          hitSlop={10}
          onPress={onAction}
          style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.55 }]}
        >
          <Text style={[styles.headerActionText, { color: colors.accent }]}>{action}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  ...props
}: PressableProps & { icon: IconName; label: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: colors.surfaceElevated },
        pressed && { opacity: 0.62, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Ionicons name={icon} size={21} color={colors.ink} />
    </Pressable>
  );
}

export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const { colors } = useAppTheme();
  const visible = names.slice(0, max);
  return (
    <View style={styles.avatarStack} accessibilityLabel={names.length ? `People: ${names.join(", ")}` : "No named people"}>
      {visible.map((name, index) => (
        <View
          key={`${name}:${index}`}
          style={[
            styles.avatar,
            {
              backgroundColor: index % 2 ? colors.accentSoft : colors.sageSoft,
              borderColor: colors.surface,
              marginLeft: index ? -7 : 0,
            },
          ]}
        >
          <Text style={[styles.avatarText, { color: index % 2 ? colors.accent : colors.sage }]}>
            {name.trim().slice(0, 1).toUpperCase()}
          </Text>
        </View>
      ))}
      {names.length > max ? (
        <Text style={[styles.avatarMore, { color: colors.muted }]}>+{names.length - max}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={30} color={colors.accent} />
        <View style={[styles.emptyLock, { backgroundColor: colors.sageSoft, borderColor: colors.background }]}>
          <Ionicons name="lock-closed" size={10} color={colors.sage} />
        </View>
      </View>
      <Text accessibilityRole="header" style={[styles.emptyTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.emptyAction,
            { backgroundColor: colors.ink },
            pressed && { opacity: 0.78, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Ionicons name="mic" size={18} color={colors.background} />
          <Text style={[styles.emptyActionText, { color: colors.background }]}>{action}</Text>
        </Pressable>
      ) : null}
      <PrivacyPill compact />
    </View>
  );
}

export function InlineState({
  icon,
  title,
  body,
  loading = false,
}: {
  icon: IconName;
  title: string;
  body?: string;
  loading?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.inlineState}>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Ionicons name={icon} size={20} color={colors.sage} />
      )}
      <View style={styles.inlineCopy}>
        <Text style={[styles.inlineTitle, { color: colors.ink }]}>{title}</Text>
        {body ? <Text style={[styles.inlineBody, { color: colors.muted }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && [styles.segmentSelected, { backgroundColor: colors.surfaceElevated }],
              pressed && { opacity: 0.65 },
            ]}
          >
            <Text style={[styles.segmentText, { color: selected ? colors.ink : colors.muted }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SoftCard({ children }: { children: ReactNode }) {
  const { colors, isDark } = useAppTheme();
  return (
    <View
      style={[
        styles.softCard,
        { backgroundColor: colors.surface },
        !isDark && shadows.card,
      ]}
    >
      {children}
    </View>
  );
}

export function MemoryListSkeleton({ rows = 2 }: { rows?: number }) {
  const { colors } = useAppTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View accessibilityLabel="Loading memories" accessibilityRole="progressbar" style={styles.skeletonList}>
      {Array.from({ length: rows }, (_, index) => (
        <Animated.View key={index} style={[styles.skeletonCard, { backgroundColor: colors.surface, opacity }]}>
          <View style={[styles.skeletonShort, { backgroundColor: colors.surfaceMuted }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: colors.surfaceMuted }]} />
          <View style={[styles.skeletonLine, { backgroundColor: colors.surfaceMuted }]} />
          <View style={[styles.skeletonLineLast, { backgroundColor: colors.surfaceMuted }]} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  privacyPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radii.pill, paddingHorizontal: 10, minHeight: 28 },
  privacyText: { fontSize: typeScale.caption, fontWeight: "600" },
  sectionHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xxl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: typeScale.title3, fontWeight: "700", letterSpacing: -0.3 },
  headerAction: { minHeight: 44, flexDirection: "row", alignItems: "center", paddingLeft: spacing.md },
  headerActionText: { fontSize: 14, fontWeight: "700" },
  iconButton: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avatarStack: { flexDirection: "row", alignItems: "center", minHeight: 28 },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 11, fontWeight: "800" },
  avatarMore: { marginLeft: 6, fontSize: typeScale.caption, fontWeight: "700" },
  emptyState: { alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  emptyIcon: { width: 76, height: 76, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  emptyLock: { position: "absolute", right: -4, bottom: -4, width: 25, height: 25, borderRadius: 13, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: typeScale.title2, fontWeight: "700", textAlign: "center", letterSpacing: -0.5 },
  emptyBody: { maxWidth: 300, fontSize: typeScale.body, lineHeight: 22, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.xl },
  emptyAction: { minHeight: 54, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  emptyActionText: { fontSize: typeScale.bodyLarge, fontWeight: "700" },
  inlineState: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  inlineCopy: { flex: 1 },
  inlineTitle: { fontSize: typeScale.body, fontWeight: "700" },
  inlineBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  segmented: { flexDirection: "row", borderRadius: radii.md, padding: 4, gap: 3 },
  segment: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segmentSelected: shadows.card,
  segmentText: { fontSize: 13, fontWeight: "700" },
  softCard: { borderRadius: radii.lg, padding: spacing.lg },
  skeletonList: { gap: spacing.md },
  skeletonCard: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  skeletonShort: { width: "35%", height: 11, borderRadius: radii.pill },
  skeletonTitle: { width: "72%", height: 20, borderRadius: 7, marginTop: spacing.xs },
  skeletonLine: { width: "100%", height: 13, borderRadius: 6 },
  skeletonLineLast: { width: "58%", height: 13, borderRadius: 6 },
});
