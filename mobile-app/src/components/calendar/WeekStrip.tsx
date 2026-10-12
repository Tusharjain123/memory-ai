import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import type { GridDay } from "../../utils/calendarGrid";
import { radii, useAppTheme } from "../../theme";

export type DayMarker = "meeting" | "ready";

const SWIPE_DISTANCE = 50;

/**
 * Seven-day strip: tap a day to focus it, swipe sideways to change week.
 * Days with meetings get a dot (accent when a transcript is ready).
 */
export function WeekStrip({
  days,
  selectedKey,
  todayKey,
  markers,
  onSelect,
  onShiftWeek,
}: {
  days: GridDay[];
  selectedKey: string;
  todayKey: string;
  markers: Record<string, DayMarker>;
  onSelect: (day: GridDay) => void;
  onShiftWeek: (delta: number) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const shift = useRef(new Animated.Value(0)).current;
  const onShiftRef = useRef(onShiftWeek);
  onShiftRef.current = onShiftWeek;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => shift.setValue(gesture.dx * 0.5),
      onPanResponderRelease: (_, gesture) => {
        const delta = gesture.dx < -SWIPE_DISTANCE ? 1 : gesture.dx > SWIPE_DISTANCE ? -1 : 0;
        if (delta) {
          void Haptics.selectionAsync();
          onShiftRef.current(delta);
          shift.setValue(-delta * 40);
        }
        Animated.spring(shift, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(shift, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  return (
    <Animated.View {...pan.panHandlers} style={[styles.row, { transform: [{ translateX: shift }] }]}>
      {days.map((day) => {
        const selected = day.key === selectedKey;
        const today = day.key === todayKey;
        const marker = markers[day.key];
        return (
          <Pressable
            key={day.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${day.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${marker ? ", has meetings" : ""}`}
            onPress={() => {
              void Haptics.selectionAsync();
              onSelect(day);
            }}
            style={({ pressed }) => [
              styles.day,
              selected
                ? { backgroundColor: colors.ink }
                : { backgroundColor: isDark ? colors.surface : colors.surface, borderColor: today ? colors.accent : colors.line, borderWidth: today ? 1.5 : StyleSheet.hairlineWidth },
              pressed && !selected && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.weekday, { color: selected ? colors.background : colors.muted }, selected && { opacity: 0.75 }]}>
              {day.date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)}
            </Text>
            <Text style={[styles.date, { color: selected ? colors.background : today ? colors.accent : colors.ink }]}>
              {day.date.getDate()}
            </Text>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: marker === "ready"
                    ? colors.accent
                    : marker === "meeting"
                      ? (selected ? colors.background : colors.muted)
                      : "transparent",
                },
              ]}
            />
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  day: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radii.md, gap: 3 },
  weekday: { fontSize: 11, fontWeight: "700" },
  date: { fontSize: 18, fontWeight: "800" },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
