import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { GoogleMeeting } from "../contracts";
import { useMeetingImports } from "../store/useMeetingImports";
import { AvatarStack } from "./AvatarStack";
import { radii, spacing, typeScale, useAppTheme } from "../theme";

export function timeRange(meeting: Pick<GoogleMeeting, "start" | "end">): string {
  const format = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${format(meeting.start)} – ${format(meeting.end)}`;
}

/** Small trailing badge: import progress, imported, or transcript state. */
export function MeetingStatusBadge({ meeting }: { meeting: GoogleMeeting }) {
  const { colors } = useAppTheme();
  const progress = useMeetingImports((state) => state.progress[meeting.eventId]);
  const imported = useMeetingImports((state) => Boolean(state.imported[meeting.eventId]));
  const live = Date.parse(meeting.start) <= Date.now() && Date.now() < Date.parse(meeting.end);

  let label: string | null = null;
  let tint = colors.muted;
  let background = colors.surfaceMuted;
  if (progress != null) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.badgeText, { color: colors.accent }]}>{Math.round(progress)}%</Text>
      </View>
    );
  }
  if (imported) {
    label = "Imported"; tint = colors.sage; background = colors.sageSoft;
  } else if (live) {
    label = "Now"; tint = colors.danger; background = colors.dangerSoft;
  } else if (meeting.transcriptStatus === "available") {
    label = "Transcript"; tint = colors.accent; background = colors.accentSoft;
  } else if (meeting.transcriptStatus === "processing") {
    label = "Preparing";
  }
  return label ? (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color: tint }]}>{label}</Text>
    </View>
  ) : null;
}

function shortTime(iso: string): { time: string; period: string } {
  const parts = new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).split(/\s+/);
  return { time: parts[0] ?? "", period: parts[1] ?? "" };
}

/** Meeting row: start time column, accent bar, title, guests, status badge. */
export function MeetingRow({ meeting, onPress }: { meeting: GoogleMeeting; onPress: () => void }) {
  const { colors } = useAppTheme();
  const guests = meeting.attendees
    .filter((attendee) => !attendee.self && attendee.response !== "declined")
    .map((attendee) => attendee.name ?? attendee.email ?? "Guest");
  const start = shortTime(meeting.start);
  const minutes = Math.round((Date.parse(meeting.end) - Date.parse(meeting.start)) / 60_000);
  const duration = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  const ended = Date.parse(meeting.end) <= Date.now();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meeting.title}, ${timeRange(meeting)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.line }, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: ended ? colors.muted : colors.ink }]}>{start.time}</Text>
        <Text style={[styles.period, { color: colors.faint }]}>{start.period || duration}</Text>
      </View>
      <View style={[styles.bar, { backgroundColor: meeting.meetCode ? colors.accent : colors.faint }]} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { color: ended ? colors.muted : colors.ink }]}>{meeting.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name={meeting.meetCode ? "videocam" : "time-outline"} size={12} color={meeting.meetCode ? colors.accent : colors.muted} />
          <Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>
            {meeting.meetCode ? "Google Meet" : "Event"} · {duration}
          </Text>
        </View>
      </View>
      <View style={styles.trailing}>
        <MeetingStatusBadge meeting={meeting} />
        <AvatarStack names={guests} max={3} size={22} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 72, borderWidth: 1, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm },
  timeColumn: { width: 48, alignItems: "flex-end" },
  time: { fontSize: 15, fontWeight: "800" },
  period: { fontSize: 11, fontWeight: "700", marginTop: 1 },
  bar: { width: 3, height: 40, borderRadius: 2 },
  copy: { flex: 1, paddingVertical: spacing.sm },
  trailing: { alignItems: "flex-end", gap: 6 },
  title: { fontSize: 15, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  meta: { fontSize: typeScale.caption, flexShrink: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "800" },
});
