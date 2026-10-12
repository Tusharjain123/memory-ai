import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, shadows, spacing, useAppTheme } from "../theme";

/** Height of the floating bar itself (without the bottom inset). */
export const TAB_BAR_HEIGHT = 66;
/** How far the Record button rises above the bar. */
export const RECORD_LIFT = 26;

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: "Home", icon: "home-outline", active: "home" },
  memories: { label: "Memories", icon: "albums-outline", active: "albums" },
  calendar: { label: "Calendar", icon: "calendar-outline", active: "calendar" },
  people: { label: "People", icon: "people-outline", active: "people" },
};

/** Space a tab screen should leave at the bottom so content clears the bar. */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.md;
}

/**
 * Floating pill tab bar with the Record button in the middle. Custom options:
 * `tabBarHidden` hides the whole bar (Home's first-run guide) and `tabHidden`
 * hides one tab (Calendar in builds without cloud config).
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const focused = state.routes[state.index];
  const focusedOptions = focused ? (descriptors[focused.key]?.options as { tabBarHidden?: boolean } | undefined) : undefined;
  if (focusedOptions?.tabBarHidden) return null;

  const visible = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options as { tabHidden?: boolean } | undefined;
    return Boolean(TAB_ICONS[route.name]) && !options?.tabHidden;
  });
  const middle = Math.ceil(visible.length / 2);

  const renderTab = (route: (typeof state.routes)[number]) => {
    const meta = TAB_ICONS[route.name]!;
    const isFocused = focused?.key === route.key;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={meta.label}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            void Haptics.selectionAsync();
            navigation.navigate(route.name, route.params);
          }
        }}
        style={styles.tab}
      >
        <Ionicons name={isFocused ? meta.active : meta.icon} size={22} color={isFocused ? colors.accent : colors.muted} />
        <Text style={[styles.label, { color: isFocused ? colors.accent : colors.muted }]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.floating]}>
        {visible.slice(0, middle).map(renderTab)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record a conversation"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/record");
          }}
          style={({ pressed }) => [styles.record, { backgroundColor: colors.accent, borderColor: colors.surface }, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <Ionicons name="mic" size={26} color="#FFFFFF" />
        </Pressable>
        {visible.slice(middle).map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.md, right: spacing.md },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: spacing.xs,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, height: "100%" },
  label: { fontSize: 11, fontWeight: "700" },
  record: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    marginTop: -RECORD_LIFT,
    marginHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});
