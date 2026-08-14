import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  getPerson,
  updatePerson,
  type PersonProfile,
  type PersonProfileUpdate,
} from "../../src/db/people";
import {
  getFollowUpBrief,
  listOpenCommitmentsForPerson,
  type CommitmentRecord,
  type FollowUpBrief,
} from "../../src/db/commitments";
import {
  listPersonMemoriesForPerson,
  type PersonMemoryRecord,
} from "../../src/db/personMemories";
import { PlayableEvidence } from "../../src/components/PlayableEvidence";
import { InlineState, SectionHeader, SoftCard } from "../../src/components/ui";
import { KeyboardScreen } from "../../src/components/KeyboardScreen";
import { relativeDate } from "../../src/utils/format";
import { radii, spacing, typeScale, useAppTheme } from "../../src/theme";

export default function PersonHomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [person, setPerson] = useState<PersonProfile | null>();
  const [brief, setBrief] = useState<FollowUpBrief | null>(null);
  const [commitments, setCommitments] = useState<CommitmentRecord[]>([]);
  const [memories, setMemories] = useState<PersonMemoryRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PersonProfileUpdate>({
    name: "",
    relationship: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [stored, followUp, openCommitments, approvedMemories] = await Promise.all([
      getPerson(id),
      getFollowUpBrief(id),
      listOpenCommitmentsForPerson(id),
      listPersonMemoriesForPerson(id, true),
    ]);
    setPerson(stored);
    setBrief(followUp);
    setCommitments(openCommitments);
    setMemories(approvedMemories);
    if (stored) {
      setForm({
        name: stored.isPlaceholder ? "" : stored.name,
        relationship: stored.relationship,
        email: stored.email,
        phone: stored.phone,
        notes: stored.notes,
      });
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (person === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="sparkles" title="Opening person…" loading />
      </View>
    );
  }
  if (!person) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="person-outline" title="Person not found" />
      </View>
    );
  }

  async function saveProfile(): Promise<void> {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await updatePerson(person!.id, form);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      await load();
    } catch (cause) {
      Alert.alert("Couldn’t save", cause instanceof Error ? cause.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  const displayName = person.isPlaceholder
    ? (person.conversations[0]?.speakerLabel ?? "Unknown speaker")
    : person.name;

  return (
    <KeyboardScreen backgroundColor={colors.background} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
        {displayName}
      </Text>
      {person.relationship ? (
        <Text style={[styles.relationship, { color: colors.muted }]}>{person.relationship}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Prepare me for my next conversation"
        onPress={() => router.push(`/person/${person.id}/prep`)}
        style={[styles.prepCta, { backgroundColor: colors.accent }]}
      >
        <Ionicons name="sparkles" size={20} color="#fff" />
        <Text style={styles.prepCtaText}>Prepare me for my next conversation</Text>
      </Pressable>

      {brief && (brief.iOwe.length || brief.theyOwe.length || brief.unresolved.length) ? (
        <>
          <SectionHeader title={`Last time with ${brief.personName}`} />
          <SoftCard>
            {brief.iOwe.map((item) => (
              <Text key={`i:${item}`} style={[styles.briefLine, { color: colors.ink }]}>
                You promised to {item.replace(/^you promised to /i, "")}.
              </Text>
            ))}
            {brief.theyOwe.map((item) => (
              <Text key={`t:${item}`} style={[styles.briefLine, { color: colors.ink }]}>
                {brief.personName} said they would {item.replace(/^.*promised to /i, "")}.
              </Text>
            ))}
            {brief.unresolved.map((item) => (
              <Text key={`u:${item}`} style={[styles.briefLine, { color: colors.muted }]}>
                {item}
              </Text>
            ))}
          </SoftCard>
        </>
      ) : null}

      <SectionHeader title="Open promises" />
      <SoftCard>
        {commitments.length ? commitments.map((item, index) => (
          <View
            key={item.id}
            style={[index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.sm, marginTop: spacing.sm }]}
          >
            <Text style={[styles.promiseDirection, { color: colors.accent }]}>
              {item.direction === "i_owe" ? "You promised" : item.direction === "they_owe" ? "They promised" : "Commitment"}
            </Text>
            <Text style={[styles.promiseText, { color: colors.ink }]}>{item.text}</Text>
            <PlayableEvidence
              recordingUri={item.recordingUri}
              quote={item.quote}
              speakerLabel={item.speakerLabel}
              startMs={item.startMs}
              confidence={item.confidence}
            />
          </View>
        )) : (
          <InlineState icon="checkmark-done-outline" title="No open promises" body="Nothing pending with this person." />
        )}
      </SoftCard>

      <SectionHeader title="Remembered facts" />
      <SoftCard>
        {memories.length ? memories.map((item, index) => (
          <View
            key={item.id}
            style={[index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.sm, marginTop: spacing.sm }]}
          >
            <Text style={[styles.factKind, { color: colors.faint }]}>
              {item.kind} · {item.memoryClass === "user_confirmed" ? "confirmed" : "inferred"}
            </Text>
            <Text style={[styles.promiseText, { color: colors.ink }]}>{item.text}</Text>
            <PlayableEvidence
              recordingUri={item.recordingUri}
              quote={item.quote}
              speakerLabel={item.speakerLabel}
              startMs={item.startMs}
              confidence={item.confidence}
            />
          </View>
        )) : (
          <InlineState icon="bookmark-outline" title="No approved facts yet" body="Approve memory candidates after processing." />
        )}
      </SoftCard>

      <SectionHeader title="Conversation timeline" />
      <SoftCard>
        {person.conversations.length ? person.conversations.map((conversation, index) => (
          <Pressable
            key={conversation.id}
            onPress={() => router.push(`/conversation/${conversation.id}`)}
            style={[
              styles.timelineRow,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
            ]}
          >
            <View style={styles.timelineCopy}>
              <Text style={[styles.timelineDate, { color: colors.muted }]}>{relativeDate(conversation.createdAt)}</Text>
              <Text style={[styles.timelineTitle, { color: colors.ink }]}>{conversation.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        )) : (
          <InlineState icon="chatbubble-outline" title="No conversations yet" />
        )}
      </SoftCard>

      <SectionHeader
        title="Profile"
        {...(!editing ? { action: "Edit", onAction: () => setEditing(true) } : {})}
      />
      {editing ? (
        <SoftCard>
          {([
            ["Name", "name", "Their name"],
            ["Relationship", "relationship", "Colleague, friend…"],
            ["Email", "email", "email@example.com"],
            ["Phone", "phone", "Phone number"],
            ["Notes", "notes", "Anything useful to remember"],
          ] as const).map(([label, key, placeholder]) => (
            <View key={key} style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
              <TextInput
                value={form[key]}
                onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
                placeholder={placeholder}
                placeholderTextColor={colors.faint}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surfaceMuted }]}
                multiline={key === "notes"}
              />
            </View>
          ))}
          <Pressable
            onPress={() => void saveProfile()}
            style={[styles.saveBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.saveText}>{saving ? "Saving…" : "Save profile"}</Text>
          </Pressable>
        </SoftCard>
      ) : (
        <SoftCard>
          <Text style={[styles.profileLine, { color: colors.ink }]}>
            {[person.email, person.phone].filter(Boolean).join(" · ") || "No contact details yet"}
          </Text>
          {person.notes ? (
            <Text style={[styles.notes, { color: colors.muted }]}>{person.notes}</Text>
          ) : null}
        </SoftCard>
      )}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1 },
  relationship: { fontSize: typeScale.body, marginBottom: spacing.sm },
  prepCta: {
    minHeight: 54,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  prepCtaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  briefLine: { fontSize: typeScale.body, lineHeight: 23, marginBottom: 6 },
  promiseDirection: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  promiseText: { fontSize: typeScale.body, fontWeight: "700", lineHeight: 22, marginTop: 4 },
  factKind: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  timelineRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timelineCopy: { flex: 1 },
  timelineDate: { fontSize: 11, fontWeight: "700" },
  timelineTitle: { fontSize: typeScale.body, fontWeight: "700", marginTop: 2 },
  field: { marginBottom: spacing.sm },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: typeScale.body,
  },
  saveBtn: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "800" },
  profileLine: { fontSize: typeScale.body, fontWeight: "600" },
  notes: { fontSize: 14, lineHeight: 21, marginTop: spacing.xs },
});
