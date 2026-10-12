import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../src/components/BottomSheet";
import { BrandLoader } from "../../src/components/BrandLoader";
import { useTabBarClearance } from "../../src/components/FloatingTabBar";
import { MeetingRow, timeRange } from "../../src/components/MeetingRow";
import { DayTimeline, HOUR_HEIGHT, timelineHours } from "../../src/components/calendar/DayTimeline";
import { WeekStrip, type DayMarker } from "../../src/components/calendar/WeekStrip";
import { CalendarScene } from "../../src/components/illustrations/scenes";
import type { GoogleMeeting } from "../../src/contracts";
import { connectCalendar, listGoogleMeetings } from "../../src/services/googleWorkspace";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useMeetingImports } from "../../src/store/useMeetingImports";
import {
  WEEKDAY_LABELS,
  addDays,
  dayKey,
  gridRange,
  groupByStartDay,
  monthGrid,
  parseDayKey,
  weekDays,
} from "../../src/utils/calendarGrid";
import { initialScrollHour } from "../../src/utils/timelineLayout";
import { fonts, radii, shadows, spacing, typeScale, useAppTheme } from "../../src/theme";

type CalendarView = "day" | "month";

function dayTitle(date: Date, now: Date): string {
  const key = dayKey(date);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(addDays(now, 1))) return "Tomorrow";
  if (key === dayKey(addDays(now, -1))) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Please try again.";
}

function sheetTitle(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  const label = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return key === today ? `Today · ${label}` : key === tomorrow ? `Tomorrow · ${label}` : label;
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  const { colors, isDark } = useAppTheme();
  const { status, calendarStatus } = useAuthStore();
  const refreshImported = useMeetingImports((state) => state.refreshImported);
  const importedIds = useMeetingImports((state) => state.imported);

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [meetings, setMeetings] = useState<GoogleMeeting[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>("day");
  const [focusKey, setFocusKey] = useState(() => dayKey(new Date()));
  const startImport = useMeetingImports((state) => state.start);
  const importProgress = useMeetingImports((state) => state.progress);
  const scrollRef = useRef<ScrollView>(null);
  const [timelineY, setTimelineY] = useState<number | null>(null);
  const requestRef = useRef(0);
  // The full brand loader only covers the very first load; month changes load inline.
  const [firstLoadDone, setFirstLoadDone] = useState(false);

  const load = useCallback(async (year: number, month: number) => {
    if (useAuthStore.getState().calendarStatus !== "connected") return;
    const request = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [list] = await Promise.all([listGoogleMeetings(gridRange(year, month)), refreshImported()]);
      if (request === requestRef.current) setMeetings(list);
    } catch (cause) {
      if (request === requestRef.current) setLoadError(errorMessage(cause));
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setFirstLoadDone(true);
      }
    }
  }, [refreshImported]);

  useFocusEffect(useCallback(() => {
    void load(cursor.year, cursor.month);
  }, [load, cursor.year, cursor.month, calendarStatus]));

  const byDay = useMemo(() => groupByStartDay(meetings ?? []), [meetings]);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const todayKey = dayKey(now);
  const focusDate = useMemo(() => parseDayKey(focusKey), [focusKey]);
  const week = useMemo(() => weekDays(focusDate), [focusDate]);
  const focusMeetings = byDay.get(focusKey) ?? [];
  const markers = useMemo(() => {
    const result: Record<string, DayMarker> = {};
    for (const [key, list] of byDay) {
      result[key] = list.some((meeting) => meeting.transcriptStatus === "available" && !importedIds[meeting.eventId]) ? "ready" : "meeting";
    }
    return result;
  }, [byDay, importedIds]);
  const focusReady = focusMeetings.filter((meeting) => meeting.transcriptStatus === "available" && !importedIds[meeting.eventId]).length;
  const liveNow = focusKey === todayKey
    ? focusMeetings.find((meeting) => Date.parse(meeting.start) <= Date.now() && Date.now() < Date.parse(meeting.end))
    : undefined;

  // Day view: keep the loaded month in step with the focused day.
  useEffect(() => {
    if (focusDate.getFullYear() !== cursor.year || focusDate.getMonth() !== cursor.month) {
      setCursor({ year: focusDate.getFullYear(), month: focusDate.getMonth() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDate]);

  // Bring the useful part of the day into view: now, else the first meeting.
  useEffect(() => {
    // Only today auto-scrolls (to now); other days are fitted to their meetings already.
    if (view !== "day" || timelineY == null || meetings == null || focusKey !== dayKey(new Date())) return;
    const { startHour } = timelineHours(focusMeetings, focusDate);
    const hour = initialScrollHour(focusMeetings, focusDate, new Date(), startHour);
    // Scroll by the distance into the day only, so early hours keep the header and week strip in view.
    const y = (hour - startHour) * HOUR_HEIGHT;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - HOUR_HEIGHT / 2), animated: true }), 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, view, timelineY, meetings == null]);

  function focusDay(key: string): void {
    setFocusKey(key);
  }

  function shiftWeek(delta: number): void {
    focusDay(dayKey(addDays(focusDate, delta * 7)));
  }

  function switchView(next: CalendarView): void {
    if (next === view) return;
    void Haptics.selectionAsync();
    if (next === "month") setCursor({ year: focusDate.getFullYear(), month: focusDate.getMonth() });
    setView(next);
  }

  // Below the grid: what can be imported this month, else what's coming next.
  const readyToImport = (meetings ?? [])
    .filter((meeting) => meeting.transcriptStatus === "available" && !importedIds[meeting.eventId])
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const upcoming = (meetings ?? [])
    .filter((meeting) => Date.parse(meeting.end) > Date.now())
    .slice(0, 3);

  function shiftMonth(delta: number): void {
    void Haptics.selectionAsync();
    setMeetings(null);
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function goToday(): void {
    void Haptics.selectionAsync();
    if (cursor.year !== now.getFullYear() || cursor.month !== now.getMonth()) {
      setMeetings(null);
      setCursor({ year: now.getFullYear(), month: now.getMonth() });
    }
    if (view === "day") focusDay(todayKey);
    else setSelectedDay(todayKey);
  }

  function openMeeting(meeting: GoogleMeeting): void {
    setSelectedDay(null);
    router.push(`/meeting/${encodeURIComponent(meeting.eventId)}` as never);
  }

  async function connect(): Promise<void> {
    setConnecting(true);
    try {
      if (await connectCalendar()) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load(cursor.year, cursor.month);
      }
    } catch (cause) {
      Alert.alert("Couldn’t connect Google Calendar", errorMessage(cause));
    } finally {
      setConnecting(false);
    }
  }

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card];

  if (status !== "signedIn" || calendarStatus !== "connected") {
    const expired = calendarStatus === "expired";
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: clearance }]}>
        <Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.ink }]}>Calendar</Text>
        <View style={styles.hero}>
          <CalendarScene size={260} />
          <Text style={[styles.heading, { color: colors.ink }]}>
            {expired ? "Reconnect Google Calendar" : "Your meetings, in one place"}
          </Text>
          <Text style={[styles.intro, { color: colors.muted }]}>
            See your Google Calendar, open meeting details, and turn Meet transcripts into memories you can search and ask about. Read-only; Memory AI never changes your calendar.
          </Text>
        </View>
        {status === "signedIn" ? (
          <Pressable accessibilityRole="button" disabled={connecting} onPress={() => void connect()}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.ink }, pressed && { opacity: 0.8 }]}>
            {connecting ? <ActivityIndicator color={colors.background} /> : <Ionicons name="logo-google" size={19} color={colors.background} />}
            <Text style={[styles.primaryText, { color: colors.background }]}>{expired ? "Reconnect" : "Connect Calendar & Meet"}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push("/cloud" as never)}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.ink }, pressed && { opacity: 0.8 }]}>
            <Ionicons name="logo-google" size={19} color={colors.background} />
            <Text style={[styles.primaryText, { color: colors.background }]}>Connect Google first</Text>
          </Pressable>
        )}
        <Text style={[styles.note, { color: colors.faint }]}>
          Meet saves transcripts only on Google Workspace plans with transcription turned on. Transcripts can be imported for 30 days after a meeting.
        </Text>
      </ScrollView>
    );
  }

  if (!firstLoadDone) return <BrandLoader label="Loading your calendar" />;

  const selectedMeetings = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: clearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && meetings != null} onRefresh={() => void load(cursor.year, cursor.month)} tintColor={colors.accent} />}
      >
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>
              {(view === "day" ? focusDate : new Date(cursor.year, cursor.month, 1))
                .toLocaleDateString(undefined, view === "day" ? { day: "numeric", month: "long", year: "numeric" } : { year: "numeric" })
                .toUpperCase()}
            </Text>
            <Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.ink }]}>
              {view === "day" ? dayTitle(focusDate, now) : new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: "long" })}
            </Text>
          </View>
          <View style={[styles.toggle, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
            {(["day", "month"] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === option }}
                onPress={() => switchView(option)}
                style={[styles.toggleItem, view === option && [{ backgroundColor: colors.surface }, !isDark && shadows.card]]}
              >
                <Text style={[styles.toggleText, { color: view === option ? colors.ink : colors.muted }]}>
                  {option === "day" ? "Day" : "Month"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summary, { color: colors.muted }]}>
            {view === "day"
              ? focusMeetings.length
                ? `${focusMeetings.length} meeting${focusMeetings.length === 1 ? "" : "s"}${focusReady ? ` · ${focusReady} transcript${focusReady === 1 ? "" : "s"} ready` : ""}`
                : "No meetings"
              : `${(meetings ?? []).filter((meeting) => new Date(meeting.start).getMonth() === cursor.month).length} meetings this month`}
          </Text>
          {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          {(view === "day" ? focusKey !== todayKey : cursor.year !== now.getFullYear() || cursor.month !== now.getMonth()) ? (
            <Pressable accessibilityRole="button" onPress={goToday} hitSlop={8}
              style={({ pressed }) => [styles.todayButton, { borderColor: colors.line, backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}>
              <Ionicons name="return-down-back" size={13} color={colors.ink} />
              <Text style={[styles.todayText, { color: colors.ink }]}>Today</Text>
            </Pressable>
          ) : null}
        </View>

        {view === "day" ? (
          <>
            <WeekStrip
              days={week}
              selectedKey={focusKey}
              todayKey={todayKey}
              markers={markers}
              onSelect={(day) => focusDay(day.key)}
              onShiftWeek={shiftWeek}
            />

            {liveNow ? (
              <View style={[styles.nowCard, { backgroundColor: colors.ink }]}>
                <View style={styles.nowHead}>
                  <View style={[styles.livePill, { backgroundColor: colors.danger }]}>
                    <View style={styles.livePillDot} />
                    <Text style={styles.livePillText}>LIVE</Text>
                  </View>
                  <Text style={[styles.nowTime, { color: colors.background }]}>{timeRange(liveNow)}</Text>
                </View>
                <Text numberOfLines={2} style={[styles.nowTitle, { color: colors.background }]}>{liveNow.title}</Text>
                <View style={styles.nowActions}>
                  {liveNow.meetCode ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void Linking.openURL(`https://meet.google.com/${liveNow.meetCode}`)}
                      style={({ pressed }) => [styles.nowButton, { backgroundColor: colors.accent }, pressed && { opacity: 0.8 }]}
                    >
                      <Ionicons name="videocam" size={16} color="#FFFFFF" />
                      <Text style={styles.nowButtonText}>Join</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/record")}
                    style={({ pressed }) => [styles.nowButton, { backgroundColor: "rgba(255,255,255,0.14)" }, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="mic" size={16} color={colors.background} />
                    <Text style={[styles.nowButtonText, { color: colors.background }]}>Record it</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Meeting details" onPress={() => openMeeting(liveNow)} hitSlop={8} style={styles.nowMore}>
                    <Ionicons name="arrow-forward" size={18} color={colors.background} />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Recent transcripts aren't tied to the focused day, so they only show on Today. */}
            {focusKey === todayKey && readyToImport.length ? (
              <>
                <Text style={[styles.section, { color: colors.muted }]}>TRANSCRIPTS FROM RECENT MEETINGS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.rail}>
                  {readyToImport.slice(0, 8).map((meeting) => {
                    const progress = importProgress[meeting.eventId];
                    return (
                      <Pressable
                        key={meeting.eventId}
                        accessibilityRole="button"
                        onPress={() => openMeeting(meeting)}
                        style={({ pressed }) => [styles.railCard, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card, pressed && { opacity: 0.85 }]}
                      >
                        <View style={[styles.railIcon, { backgroundColor: colors.accentSoft }]}>
                          <Ionicons name="document-text" size={16} color={colors.accent} />
                        </View>
                        <Text numberOfLines={2} style={[styles.railTitle, { color: colors.ink }]}>{meeting.title}</Text>
                        <Text style={[styles.railMeta, { color: colors.muted }]}>{shortDate(meeting.start)}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Import ${meeting.title}`}
                          disabled={progress != null}
                          onPress={() => void startImport(meeting)}
                          style={({ pressed }) => [styles.railButton, { backgroundColor: colors.ink }, pressed && { opacity: 0.8 }]}
                        >
                          {progress != null ? (
                            <Text style={[styles.railButtonText, { color: colors.background }]}>{Math.round(progress)}%</Text>
                          ) : (
                            <>
                              <Ionicons name="add" size={15} color={colors.background} />
                              <Text style={[styles.railButtonText, { color: colors.background }]}>Import</Text>
                            </>
                          )}
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {loadError ? (
              <View style={card}>
                <Text style={[styles.sectionTitle, { color: colors.danger }]}>Couldn’t load meetings</Text>
                <Text style={[styles.note, styles.noteLeft, { color: colors.muted }]}>{loadError}</Text>
              </View>
            ) : null}

            {focusMeetings.length ? (
              <View
                onLayout={(event) => setTimelineY(event.nativeEvent.layout.y + spacing.md)}
                style={[card, styles.timelineCard]}
              >
                <DayTimeline day={focusDate} meetings={focusMeetings} now={now} onOpen={openMeeting} />
              </View>
            ) : meetings == null ? null : (
              <View style={styles.emptyDay}>
                <CalendarScene size={200} />
                <Text style={[styles.emptyTitle, { color: colors.ink }]}>A clear day.</Text>
                <Text style={[styles.note, { color: colors.muted, marginTop: 4 }]}>
                  Nothing on your calendar. Good time to think out loud.
                </Text>
                <Pressable accessibilityRole="button" onPress={() => router.push("/record")}
                  style={({ pressed }) => [styles.emptyButton, { borderColor: colors.line, backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}>
                  <Ionicons name="mic-outline" size={17} color={colors.accent} />
                  <Text style={[styles.todayText, { color: colors.ink }]}>Record a thought</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : (
          <>
        <View style={card}>
          <View style={styles.monthRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shiftMonth(-1)} hitSlop={10} style={[styles.navButton, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <View style={styles.monthCenter}>
              <View style={[styles.dot, { backgroundColor: colors.muted }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Meeting</Text>
              <View style={[styles.dot, { backgroundColor: colors.accent, marginLeft: spacing.xs }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Transcript ready</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shiftMonth(1)} hitSlop={10} style={[styles.navButton, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="chevron-forward" size={18} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={[styles.weekday, { color: colors.faint }]}>{label.slice(0, 1)}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((day) => {
              const dayMeetings = byDay.get(day.key) ?? [];
              const isToday = day.key === todayKey;
              const isSelected = day.key === selectedDay;
              return (
                <Pressable
                  key={day.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.date.toDateString()}, ${dayMeetings.length} meetings`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSelectedDay(day.key);
                  }}
                  style={styles.cell}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      isToday && { backgroundColor: colors.accent },
                      isSelected && !isToday && { backgroundColor: colors.ink },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        { color: day.inMonth ? colors.ink : colors.faint },
                        (isToday || isSelected) && { color: isToday ? "#FFFFFF" : colors.background, fontWeight: "800" },
                      ]}
                    >
                      {day.date.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dots}>
                    {dayMeetings.slice(0, 3).map((meeting) => (
                      <View
                        key={meeting.eventId}
                        style={[styles.dot, {
                          backgroundColor: meeting.transcriptStatus === "available" && !importedIds[meeting.eventId]
                            ? colors.accent
                            : day.inMonth ? colors.muted : colors.faint,
                        }]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {loadError ? (
          <View style={card}>
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>Couldn’t load meetings</Text>
            <Text style={[styles.note, styles.noteLeft, { color: colors.muted }]}>{loadError}</Text>
          </View>
        ) : null}

        {readyToImport.length ? (
          <>
            <Text style={[styles.section, { color: colors.muted }]}>READY TO IMPORT</Text>
            {readyToImport.slice(0, 5).map((meeting) => (
              <MeetingRow key={meeting.eventId} meeting={meeting} onPress={() => openMeeting(meeting)} />
            ))}
          </>
        ) : upcoming.length ? (
          <>
            <Text style={[styles.section, { color: colors.muted }]}>COMING UP</Text>
            {upcoming.map((meeting) => (
              <MeetingRow key={meeting.eventId} meeting={meeting} onPress={() => openMeeting(meeting)} />
            ))}
          </>
        ) : null}

          </>
        )}

        <Text style={[styles.note, { color: colors.faint }]}>
          {view === "day" ? "Swipe the week strip to move between weeks." : "Tap a date to see its meetings."} Meet transcripts need a Google Workspace plan with transcription on and can be imported for 30 days.
        </Text>
      </ScrollView>

      <BottomSheet
        visible={selectedDay != null}
        onClose={() => setSelectedDay(null)}
        header={
          selectedDay ? (
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.ink }]}>{sheetTitle(selectedDay)}</Text>
              <View style={styles.sheetSubRow}>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  {selectedMeetings.length
                    ? `${selectedMeetings.length} ${selectedMeetings.length === 1 ? "meeting" : "meetings"}`
                    : "No meetings"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    focusDay(selectedDay);
                    setSelectedDay(null);
                    setView("day");
                  }}
                >
                  <Text style={[styles.openDay, { color: colors.accent }]}>Open day view →</Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
      >
        <ScrollView contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
          {selectedMeetings.length ? (
            selectedMeetings.map((meeting) => (
              <MeetingRow key={meeting.eventId} meeting={meeting} onPress={() => openMeeting(meeting)} />
            ))
          ) : (
            <View style={styles.sheetEmpty}>
              <Ionicons name="sunny-outline" size={28} color={colors.faint} />
              <Text style={[styles.note, { color: colors.muted, marginTop: spacing.xs }]}>Nothing on your calendar this day.</Text>
            </View>
          )}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  flex: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 2 },
  pageTitle: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: -0.3 },
  toggle: { flexDirection: "row", borderRadius: radii.pill, padding: 3, marginBottom: 8 },
  toggleItem: { borderRadius: radii.pill, paddingHorizontal: 14, minHeight: 32, justifyContent: "center" },
  toggleText: { fontSize: 13, fontWeight: "800" },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 34, marginBottom: spacing.xs },
  summary: { flex: 1, fontSize: 14 },
  todayButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 12, minHeight: 32, justifyContent: "center" },
  nowCard: { borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.sm },
  nowHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  livePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFFFFF" },
  livePillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  nowTime: { fontSize: 12.5, fontWeight: "700", opacity: 0.75 },
  nowTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, marginTop: spacing.xs },
  nowActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  nowButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radii.pill, paddingHorizontal: 14, minHeight: 38 },
  nowButtonText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800" },
  nowMore: { marginLeft: "auto", width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  railScroll: { marginHorizontal: -spacing.lg },
  rail: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 4 },
  railCard: { width: 190, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.sm + 2 },
  railIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  railTitle: { fontSize: 14.5, fontWeight: "800", marginTop: spacing.xs, minHeight: 38 },
  railMeta: { fontSize: 12, marginTop: 2 },
  railButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: radii.pill, minHeight: 34, marginTop: spacing.sm },
  railButtonText: { fontSize: 13, fontWeight: "800" },
  timelineCard: { marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  emptyDay: { alignItems: "center", paddingTop: spacing.md },
  emptyTitle: { fontFamily: fonts.display, fontSize: 28, marginTop: spacing.xs },
  emptyButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 16, minHeight: 42, marginTop: spacing.md },
  sheetSubRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  openDay: { fontSize: 13, fontWeight: "800" },
  todayText: { fontSize: 13, fontWeight: "800" },
  hero: { alignItems: "center", paddingVertical: spacing.lg },
  heroIcon: { width: 68, height: 68, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  heading: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, marginTop: spacing.xs, textAlign: "center" },
  intro: { fontSize: typeScale.body, lineHeight: 21, textAlign: "center", marginTop: spacing.xs },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthCenter: { flexDirection: "row", alignItems: "center", gap: 5 },
  monthTitle: { fontSize: 12.5, fontWeight: "700" },
  navButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row", marginTop: spacing.md },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.xs },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayNumber: { fontSize: 15, fontWeight: "600" },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm, paddingTop: spacing.sm },
  legendText: { fontSize: 11, fontWeight: "600" },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: spacing.md, marginLeft: spacing.xs },
  sectionTitle: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  primary: { minHeight: 54, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  primaryText: { fontSize: 15, fontWeight: "800" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: spacing.md, marginTop: spacing.md },
  noteLeft: { textAlign: "left", paddingHorizontal: 0, marginTop: spacing.xs },
  sheetHeader: { paddingBottom: spacing.sm },
  sheetTitle: { fontSize: typeScale.title3, fontWeight: "800" },
  sheetSubtitle: { fontSize: typeScale.caption, marginTop: 2 },
  sheetList: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  sheetEmpty: { alignItems: "center", paddingVertical: spacing.xl },
});
