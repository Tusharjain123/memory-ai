import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import type { GoogleMeeting } from "../../contracts";
import { layoutTimeline } from "../../utils/timelineLayout";
import { AvatarStack } from "../AvatarStack";
import { MeetingStatusBadge, timeRange } from "../MeetingRow";
import { pastelFor, radii, spacing, useAppTheme } from "../../theme";

export const HOUR_HEIGHT = 68;
const RAIL_WIDTH = 46;
const GAP = 4;

/**
 * Hour range for the rail, fitted to the day: an hour before the first meeting
 * (or now, on today) through an hour after the last, at least 8 hours tall.
 */
export function timelineHours(meetings: GoogleMeeting[], day: Date, now = new Date()): { startHour: number; endHour: number } {
  const sameDay = (date: Date) => date.toDateString() === day.toDateString();
  const starts = meetings.map((meeting) => new Date(meeting.start)).filter(sameDay).map((date) => date.getHours());
  const ends = meetings.map((meeting) => new Date(meeting.end)).filter(sameDay)
    .map((date) => date.getHours() + (date.getMinutes() ? 1 : 0));
  // "Now" only stretches the rail during waking hours; at 2am, start at the first meeting.
  const nowMatters = sameDay(now) && now.getHours() >= 6;
  const anchors = [...starts, ...(nowMatters ? [now.getHours()] : [])];
  const startHour = Math.max(0, (anchors.length ? Math.min(...anchors) : 9) - 1);
  const endHour = Math.min(24, Math.max(startHour + 8, ...ends.map((hour) => hour + 1), ...(nowMatters ? [now.getHours() + 2] : [])));
  return { startHour, endHour };
}

function hourLabel(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" }).replace(/\s?([AP]M)/i, (_, p: string) => ` ${p.toLowerCase()}`);
}

function guestNames(meeting: GoogleMeeting): string[] {
  return meeting.attendees
    .filter((attendee) => !attendee.self && attendee.response !== "declined")
    .map((attendee) => attendee.name ?? attendee.email ?? "Guest");
}

/** Hour-by-hour agenda for one day with colour-coded, overlap-aware meeting blocks. */
export function DayTimeline({
  day,
  meetings,
  now,
  onOpen,
}: {
  day: Date;
  meetings: GoogleMeeting[];
  now: Date;
  onOpen: (meeting: GoogleMeeting) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const [width, setWidth] = useState(0);
  const { startHour, endHour } = timelineHours(meetings, day, now);
  const blocks = useMemo(
    () => layoutTimeline(meetings.map((meeting) => ({ ...meeting, id: meeting.eventId })), { day, startHour, endHour }),
    [day, endHour, meetings, startHour],
  );
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const isToday = day.toDateString() === now.toDateString();
  const nowTop = ((now.getHours() - startHour) * 60 + now.getMinutes()) * (HOUR_HEIGHT / 60);
  const showNow = isToday && now.getHours() >= startHour && now.getHours() < endHour;
  const laneWidth = Math.max(0, width - RAIL_WIDTH);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: (endHour - startHour) * HOUR_HEIGHT + 12 }}
    >
      {hours.map((hour, index) => (
        <View key={hour} style={[styles.hourRow, { top: index * HOUR_HEIGHT }]}>
          <Text style={[styles.hourText, { color: colors.faint }]}>{hourLabel(hour % 24)}</Text>
          <View style={[styles.hourLine, { backgroundColor: colors.line }]} />
        </View>
      ))}

      {laneWidth > 0 ? blocks.map((block) => {
        const meeting = block.item;
        const top = block.top * (HOUR_HEIGHT / 60) + 6;
        const height = Math.max(block.height * (HOUR_HEIGHT / 60) - GAP, 30);
        const columnWidth = laneWidth / block.columns;
        const live = Date.parse(meeting.start) <= now.getTime() && now.getTime() < Date.parse(meeting.end);
        const past = Date.parse(meeting.end) <= now.getTime();
        const tint = pastelFor(meeting.eventId, isDark);
        const background = live ? colors.ink : tint.soft;
        const ink = live ? colors.background : tint.ink;
        const roomy = height >= 62;
        const compact = height < 46;
        const guests = guestNames(meeting);
        return (
          <Pressable
            key={meeting.eventId}
            accessibilityRole="button"
            accessibilityLabel={`${meeting.title}, ${timeRange(meeting)}${live ? ", happening now" : ""}`}
            onPress={() => onOpen(meeting)}
            style={({ pressed }) => [
              styles.block,
              {
                top,
                height,
                left: RAIL_WIDTH + block.column * columnWidth,
                width: columnWidth - GAP,
                backgroundColor: background,
                borderLeftColor: live ? colors.accent : tint.edge,
                opacity: past && !live ? 0.72 : 1,
              },
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <View style={styles.blockHead}>
              {live ? <View style={[styles.liveDot, { backgroundColor: colors.accent }]} /> : null}
              <Text numberOfLines={roomy ? 2 : 1} style={[styles.blockTitle, { color: ink }]}>{meeting.title}</Text>
              {compact ? (
                <Text style={[styles.blockTime, styles.compactTime, { color: ink }]}>
                  {new Date(meeting.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </Text>
              ) : null}
            </View>
            {compact ? null : (
              <Text numberOfLines={1} style={[styles.blockTime, { color: ink }]}>
                {live && !roomy ? "Now · " : ""}{timeRange(meeting)}
              </Text>
            )}
            {roomy && block.columns === 1 ? (
              <View style={styles.blockFoot}>
                <AvatarStack names={guests} size={22} />
                {meeting.meetCode ? <Ionicons name="videocam" size={14} color={ink} style={{ opacity: 0.7 }} /> : null}
                <View style={{ flex: 1 }} />
                <MeetingStatusBadge meeting={meeting} />
              </View>
            ) : null}
          </Pressable>
        );
      }) : null}

      {showNow ? (
        <View pointerEvents="none" style={[styles.nowRow, { top: nowTop }]}>
          <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
          <View style={[styles.nowLine, { backgroundColor: colors.danger }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hourRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", height: 12 },
  hourText: { width: RAIL_WIDTH, fontSize: 11, fontWeight: "700" },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth },
  block: {
    position: "absolute",
    borderRadius: radii.sm + 2,
    borderLeftWidth: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
  },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  blockTitle: { flex: 1, fontSize: 13.5, fontWeight: "800" },
  blockTime: { fontSize: 11.5, fontWeight: "600", opacity: 0.8, marginTop: 1 },
  compactTime: { marginTop: 0 },
  blockFoot: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: "auto" },
  nowRow: { position: "absolute", left: RAIL_WIDTH - 5, right: 0, flexDirection: "row", alignItems: "center", marginTop: 1 },
  nowDot: { width: 10, height: 10, borderRadius: 5 },
  nowLine: { flex: 1, height: 2 },
});
