import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BrandLoader } from "../../src/components/BrandLoader";
import { AvatarStack, avatarColors, personInitials } from "../../src/components/AvatarStack";
import { timeRange } from "../../src/components/MeetingRow";
import type { GoogleAttendeeResponse, GoogleMeeting } from "../../src/contracts";
import { findKnownPeople } from "../../src/db/people";
import { getPersonPrepBrief, type PersonPrepBrief } from "../../src/db/personMemories";
import { cachedMeeting, getGoogleMeeting } from "../../src/services/googleWorkspace";
import { useMeetingImports } from "../../src/store/useMeetingImports";
import { fonts, pastelFor, radii, shadows, spacing, typeScale, useAppTheme, type AppColors } from "../../src/theme";

type KnownAttendee = { id: string; name: string; conversationCount: number; lastInteractionAt: string; brief: PersonPrepBrief | null };

function sinceLabel(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type IconName = ComponentProps<typeof Ionicons>["name"];

function durationLabel(meeting: GoogleMeeting): string {
  const minutes = Math.round((Date.parse(meeting.end) - Date.parse(meeting.start)) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function relativeStart(meeting: GoogleMeeting, now = Date.now()): string | null {
  const start = Date.parse(meeting.start);
  const end = Date.parse(meeting.end);
  if (start <= now && now < end) return "Happening now";
  const minutes = Math.round((start - now) / 60_000);
  if (minutes > 0 && minutes < 60) return `Starts in ${minutes} min`;
  if (minutes >= 60 && minutes < 24 * 60) return `Starts in ${Math.round(minutes / 60)} h`;
  return null;
}


function DetailRow({ icon, label, value, colors, onPress }: {
  icon: IconName; label: string; value: string; colors: AppColors; onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: colors.muted }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.rowValue, { color: onPress ? colors.accent : colors.ink }]}>{value}</Text>
      </View>
      {onPress ? <Ionicons name="open-outline" size={17} color={colors.faint} /> : null}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.detailRow, pressed && { opacity: 0.6 }]}>{content}</Pressable>
  ) : <View style={styles.detailRow}>{content}</View>;
}

export default function MeetingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = decodeURIComponent(String(id ?? ""));
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [meeting, setMeeting] = useState<GoogleMeeting | null>(() => cachedMeeting(eventId));
  const [error, setError] = useState<string | null>(null);
  const progress = useMeetingImports((state) => state.progress[eventId]);
  const conversationId = useMeetingImports((state) => state.imported[eventId]);
  const startImport = useMeetingImports((state) => state.start);
  const refreshImported = useMeetingImports((state) => state.refreshImported);
  const [known, setKnown] = useState<KnownAttendee[]>([]);

  useEffect(() => {
    let cancelled = false;
    void refreshImported();
    void getGoogleMeeting(eventId)
      .then((fresh) => { if (!cancelled) setMeeting(fresh); })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load this meeting");
      });
    return () => { cancelled = true; };
  }, [eventId, refreshImported]);

  // People already in Memory: what you last talked about and what's still open.
  const attendeeKey = meeting?.attendees.map((attendee) => attendee.email ?? attendee.name).join("|") ?? "";
  useEffect(() => {
    if (!meeting) return;
    let cancelled = false;
    void findKnownPeople(meeting.attendees.filter((attendee) => !attendee.self))
      .then((people) => Promise.all(people.slice(0, 3).map(async (person) => ({
        ...person,
        brief: await getPersonPrepBrief(person.id).catch(() => null),
      }))))
      .then((people) => { if (!cancelled) setKnown(people); })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeeKey]);

  if (!meeting) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {error ? (
          <>
            <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
            <Text style={[styles.body, { color: colors.muted, textAlign: "center" }]}>{error}</Text>
          </>
        ) : <BrandLoader label="Loading meeting details" />}
      </View>
    );
  }

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card];
  const date = new Date(meeting.start).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const soon = relativeStart(meeting);
  const ended = Date.parse(meeting.end) <= Date.now();
  const joinable = Boolean(meeting.meetCode) && !ended;
  const meetUrl = meeting.meetCode ? `https://meet.google.com/${meeting.meetCode}` : null;
  const guests = [...meeting.attendees].sort((a, b) => Number(b.self) - Number(a.self));

  // One clear next step for the transcript.
  let transcript: { icon: IconName; title: string; body: string; action?: { label: string; onPress: () => void }; busy?: boolean };
  if (conversationId) {
    transcript = {
      icon: "checkmark-circle-outline",
      title: "Saved as a memory",
      body: "Summary, people, decisions and commitments are ready. Ask Memory about it anytime.",
      action: { label: "Open memory", onPress: () => router.push(`/conversation/${conversationId}`) },
    };
  } else if (progress != null) {
    transcript = { icon: "sparkles-outline", title: `Importing… ${Math.round(progress)}%`, body: "Reading the transcript and finding people, decisions and commitments.", busy: true };
  } else if (meeting.transcriptStatus === "available") {
    transcript = {
      icon: "document-text-outline",
      title: "Transcript available",
      body: "Import it to get a summary, the people involved, decisions and commitments.",
      action: { label: "Import transcript", onPress: () => void startImport(meeting).then((created) => { if (created) router.push(`/conversation/${created}`); }) },
    };
  } else if (meeting.transcriptStatus === "processing") {
    transcript = { icon: "hourglass-outline", title: "Google is preparing the transcript", body: "Check back in a few minutes." };
  } else if (meeting.transcriptStatus === "expired") {
    transcript = {
      icon: "time-outline",
      title: "Transcript no longer importable",
      body: "Google keeps Meet transcripts available for import for 30 days.",
      ...(meeting.docUrl ? { action: { label: "Open in Google Docs", onPress: () => void Linking.openURL(meeting.docUrl!) } } : {}),
    };
  } else if (!ended) {
    transcript = {
      icon: "mic-outline",
      title: meeting.meetCode ? "Transcript after the meeting" : "Record this meeting",
      body: meeting.meetCode
        ? "If Meet transcription is on, the transcript can be imported here when the call ends. You can also record it with Memory."
        : "Start a recording during the meeting and Memory will link it to this event.",
      action: { label: "Record with Memory", onPress: () => router.push("/record") },
    };
  } else {
    transcript = {
      icon: "document-outline",
      title: "No transcript",
      body: meeting.meetCode
        ? "Meet didn't save a transcript for this call. Transcripts need a Workspace plan with transcription turned on."
        : "This event had no Google Meet call.",
    };
  }

  const day = new Date(meeting.start);
  const guestNames = guests.filter((guest) => guest.response !== "declined").map((guest) => guest.name ?? guest.email ?? "Guest");
  const rsvpCounts = guests.reduce<Record<GoogleAttendeeResponse, number>>(
    (counts, guest) => ({ ...counts, [guest.response]: counts[guest.response] + 1 }),
    { accepted: 0, tentative: 0, declined: 0, needsAction: 0 },
  );
  const rsvpSummary = [
    rsvpCounts.accepted ? `${rsvpCounts.accepted} going` : null,
    rsvpCounts.tentative ? `${rsvpCounts.tentative} maybe` : null,
    rsvpCounts.needsAction ? `${rsvpCounts.needsAction} awaiting` : null,
    rsvpCounts.declined ? `${rsvpCounts.declined} declined` : null,
  ].filter(Boolean).join(" · ");
  const organizerName = meeting.organizer
    ? meeting.organizer.self ? "You" : meeting.organizer.name ?? meeting.organizer.email
    : null;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={[pastelFor(meeting.eventId, isDark).soft, isDark ? colors.surface : colors.accentSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTop}>
          <View style={[styles.dateBlock, { backgroundColor: colors.surface }]}>
            <Text style={[styles.dateMonth, { color: colors.accent }]}>
              {day.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
            </Text>
            <Text style={[styles.dateDay, { color: colors.ink }]}>{day.getDate()}</Text>
          </View>
          <View style={styles.flex}>
            {soon ? (
              <View style={[styles.pill, { backgroundColor: soon === "Happening now" ? colors.dangerSoft : colors.surface }]}>
                {soon === "Happening now" ? <View style={[styles.liveDot, { backgroundColor: colors.danger }]} /> : null}
                <Text style={[styles.pillText, { color: soon === "Happening now" ? colors.danger : colors.accent }]}>{soon}</Text>
              </View>
            ) : (
              <Text style={[styles.heroEyebrow, { color: colors.accent }]}>{ended ? "PAST MEETING" : "UPCOMING"}</Text>
            )}
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{meeting.title}</Text>
          </View>
        </View>
        <View style={styles.heroMeta}>
          <Ionicons name="time-outline" size={15} color={colors.muted} />
          <Text style={[styles.heroMetaText, { color: colors.muted }]}>
            {date} · {timeRange(meeting)} · {durationLabel(meeting)}
          </Text>
        </View>
        {guestNames.length ? (
          <View style={styles.heroGuests}>
            <AvatarStack names={guestNames} max={5} size={30} />
            <Text style={[styles.heroMetaText, { color: colors.muted }]}>
              {guestNames.length} {guestNames.length === 1 ? "person" : "people"}
            </Text>
          </View>
        ) : null}
        {joinable && meetUrl ? (
          <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(meetUrl)}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.ink }, pressed && { opacity: 0.85 }]}>
            <Ionicons name="videocam" size={19} color={colors.background} />
            <Text style={[styles.primaryText, { color: colors.background }]}>Join Google Meet</Text>
          </Pressable>
        ) : null}
      </LinearGradient>

      <View style={card}>
        <View style={styles.transcriptHead}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
            {transcript.busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={transcript.icon} size={18} color={colors.accent} />}
          </View>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>{transcript.title}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{transcript.body}</Text>
          </View>
        </View>
        {progress != null ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.max(4, Math.min(100, progress))}%` }]} />
          </View>
        ) : null}
        {transcript.action ? (
          <Pressable accessibilityRole="button" onPress={transcript.action.onPress}
            style={({ pressed }) => [styles.secondary, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}>
            <Text style={styles.secondaryText}>{transcript.action.label}</Text>
          </Pressable>
        ) : null}
      </View>

      {known.length ? (
        <>
          <Text style={[styles.section, { color: colors.muted }]}>{ended ? "PEOPLE YOU KNOW HERE" : "BEFORE YOU JOIN"}</Text>
          <View style={card}>
            {known.map((person, index) => {
              const tint = avatarColors(person.name);
              const promise = person.brief?.openPromises[0];
              return (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Prep brief for ${person.name}`}
                  onPress={() => router.push(`/person/${person.id}/prep` as never)}
                  style={({ pressed }) => [styles.knownRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.knownAvatar, { backgroundColor: tint.background }]}>
                    <Text style={[styles.knownInitials, { color: tint.ink }]}>{personInitials(person.name)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.cardTitle, { color: colors.ink }]}>{person.name}</Text>
                    <Text numberOfLines={1} style={[styles.knownMeta, { color: colors.muted }]}>
                      {person.conversationCount} conversation{person.conversationCount === 1 ? "" : "s"} · last {sinceLabel(person.lastInteractionAt)}
                    </Text>
                    {person.brief?.lastConversation ? (
                      <Text numberOfLines={2} style={[styles.knownNote, { color: colors.ink }]}>
                        Last time: {person.brief.lastConversation.title}
                      </Text>
                    ) : null}
                    {promise ? (
                      <View style={[styles.knownPromise, { backgroundColor: colors.warmSoft }]}>
                        <Ionicons name="flag" size={12} color={colors.warm} />
                        <Text numberOfLines={2} style={[styles.knownPromiseText, { color: colors.ink }]}>{promise.text}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.faint} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={[styles.section, { color: colors.muted }]}>DETAILS</Text>
      <View style={card}>
        {organizerName ? <DetailRow icon="person-circle-outline" label="Organizer" value={organizerName} colors={colors} /> : null}
        {meeting.location ? <DetailRow icon="location-outline" label="Location" value={meeting.location} colors={colors} /> : null}
        {meetUrl ? (
          <DetailRow icon="videocam-outline" label="Google Meet" value={`meet.google.com/${meeting.meetCode}`} colors={colors} onPress={() => void Linking.openURL(meetUrl)} />
        ) : null}
        {meeting.htmlLink ? (
          <DetailRow icon="calendar-outline" label="Google Calendar" value="Open event" colors={colors} onPress={() => void Linking.openURL(meeting.htmlLink!)} />
        ) : null}
        {meeting.docUrl ? (
          <DetailRow icon="document-text-outline" label="Transcript doc" value="Open in Google Docs" colors={colors} onPress={() => void Linking.openURL(meeting.docUrl!)} />
        ) : null}
      </View>

      {meeting.description ? (
        <>
          <Text style={[styles.section, { color: colors.muted }]}>AGENDA & NOTES</Text>
          <View style={card}>
            <Text selectable style={[styles.description, { color: colors.ink }]}>{meeting.description}</Text>
          </View>
        </>
      ) : null}

      <Text style={[styles.section, { color: colors.muted }]}>
        {guests.length ? `PARTICIPANTS · ${guests.length}` : "PARTICIPANTS"}
      </Text>
      <View style={card}>
        {rsvpSummary ? <Text style={[styles.body, { color: colors.muted, marginTop: 0 }]}>{rsvpSummary}</Text> : null}
        {guests.length ? guests.map((guest, index) => {
          const name = guest.name ?? guest.email ?? "Guest";
          const tint = avatarColors(name);
          const rsvp = RSVP[guest.response];
          return (
            <View key={`${guest.email ?? name}-${index}`} style={[styles.guestRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
              <View style={[styles.avatar, { backgroundColor: guest.self ? colors.ink : tint.background }]}>
                <Text style={[styles.avatarText, { color: guest.self ? colors.background : tint.ink }]}>{personInitials(name)}</Text>
              </View>
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.guestName, { color: colors.ink }]}>
                  {guest.self ? `${name} (you)` : name}
                </Text>
                <Text numberOfLines={1} style={[styles.guestEmail, { color: colors.muted }]}>
                  {guest.organizer ? "Organizer" : guest.name && guest.email ? guest.email : " "}
                </Text>
              </View>
              <View style={[styles.rsvp, { backgroundColor: rsvp.tone === "good" ? colors.sageSoft : rsvp.tone === "bad" ? colors.dangerSoft : colors.surfaceMuted }]}>
                <Ionicons name={rsvp.icon} size={12} color={rsvp.tone === "good" ? colors.sage : rsvp.tone === "bad" ? colors.danger : colors.muted} />
                <Text style={[styles.rsvpText, { color: rsvp.tone === "good" ? colors.sage : rsvp.tone === "bad" ? colors.danger : colors.muted }]}>{rsvp.label}</Text>
              </View>
            </View>
          );
        }) : <Text style={[styles.body, { color: colors.muted }]}>No guests on this event.</Text>}
      </View>
    </ScrollView>
  );
}

const RSVP: Record<GoogleAttendeeResponse, { label: string; icon: IconName; tone: "good" | "bad" | "neutral" }> = {
  accepted: { label: "Going", icon: "checkmark", tone: "good" },
  tentative: { label: "Maybe", icon: "help", tone: "neutral" },
  declined: { label: "Declined", icon: "close", tone: "bad" },
  needsAction: { label: "Awaiting", icon: "time-outline", tone: "neutral" },
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  heroCard: { borderRadius: radii.xl, padding: spacing.lg, gap: spacing.md },
  heroTop: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  dateBlock: { width: 60, borderRadius: radii.md, alignItems: "center", paddingVertical: spacing.xs },
  dateMonth: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  dateDay: { fontSize: 26, fontWeight: "800", lineHeight: 30 },
  heroEyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: "800" },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, marginTop: 4 },
  knownRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.sm },
  knownAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  knownInitials: { fontSize: 14, fontWeight: "800" },
  knownMeta: { fontSize: 12.5, marginTop: 1 },
  knownNote: { fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  knownPromise: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: radii.sm, paddingHorizontal: 9, paddingVertical: 6, marginTop: 6 },
  knownPromiseText: { flex: 1, fontSize: 12.5, fontWeight: "700", lineHeight: 17 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroMetaText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  heroGuests: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  primary: { minHeight: 50, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  primaryText: { fontSize: 15, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  detailRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 11, fontWeight: "700" },
  rowValue: { fontSize: 15, fontWeight: "700", marginTop: 1 },
  transcriptHead: { flexDirection: "row", gap: spacing.sm },
  cardTitle: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  body: { fontSize: typeScale.caption, lineHeight: 18, marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  secondary: { minHeight: 46, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  secondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginLeft: spacing.xs, marginTop: spacing.xs, marginBottom: -spacing.xs },
  description: { fontSize: 14, lineHeight: 21 },
  guestRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontWeight: "800" },
  guestName: { fontSize: 15, fontWeight: "700" },
  guestEmail: { fontSize: typeScale.caption, marginTop: 1 },
  rsvp: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  rsvpText: { fontSize: 11, fontWeight: "800" },
});
