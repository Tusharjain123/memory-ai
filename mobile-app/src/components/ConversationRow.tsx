import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConversationListItem } from "../db/conversations";
import { formatDuration, relativeDate } from "../utils/format";
import { radii, spacing, typeScale, useAppTheme } from "../theme";

/** Compact memory row: icon tile, title, "Today · 12 min · 3 people", review tag or chevron. */
export function ConversationRow({
  item,
  onPress,
  showDate = true,
}: {
  item: ConversationListItem;
  onPress: () => void;
  /** Hide the day when the row already sits under a day heading. */
  showDate?: boolean;
}) {
  const { colors } = useAppTheme();
  const meet = item.source === "google_meet";
  const when = showDate
    ? relativeDate(item.createdAt)
    : new Date(item.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const meta = [
    when,
    formatDuration(item.durationMs),
    item.people.length ? `${item.people.length} ${item.people.length === 1 ? "person" : "people"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={meet ? "videocam-outline" : "mic-outline"} size={19} color={colors.accent} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{item.title}</Text>
        <Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>{meta}</Text>
      </View>
      {item.pendingReviewCount > 0 ? (
        <View style={[styles.tag, { backgroundColor: colors.sageSoft }]}>
          <Text style={[styles.tagText, { color: colors.sage }]}>Review</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={17} color={colors.faint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: "800" },
  meta: { fontSize: typeScale.caption, marginTop: 3 },
  tag: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: "800" },
});
