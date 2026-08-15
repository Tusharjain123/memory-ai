import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  getConversation,
  refreshMemoryReviewCount,
  setDecisionApproval,
  type ConversationCommitment,
  type ConversationDecision,
  type ConversationDetail,
} from "../../src/db/conversations";
import { listPeople } from "../../src/db/insights";
import {
  listPendingMemoriesForConversation,
  setPersonMemoryApproval,
  type PersonMemoryRecord,
} from "../../src/db/personMemories";
import { setCommitmentApproval } from "../../src/db/commitments";
import { EvidenceCard } from "../../src/components/EvidenceCard";
import { InlineState, SoftCard } from "../../src/components/ui";
import { useClipPlayer } from "../../src/hooks/useClipPlayer";
import { radii, spacing, typeScale, useAppTheme } from "../../src/theme";

type ReviewItem =
  | { type: "commitment"; item: ConversationCommitment }
  | { type: "decision"; item: ConversationDecision }
  | { type: "memory"; item: PersonMemoryRecord };

export default function MemoryReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [conversation, setConversation] = useState<ConversationDetail | null>();
  const [memories, setMemories] = useState<PersonMemoryRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [activeMs, setActiveMs] = useState<number | null>(null);
  const clip = useClipPlayer(conversation?.recordingUri);

  const load = useCallback(async () => {
    if (!id) return;
    const [detail, pendingMemories] = await Promise.all([
      getConversation(id),
      listPendingMemoriesForConversation(id),
    ]);
    setConversation(detail);
    setMemories(pendingMemories);
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (conversation === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="sparkles" title="Preparing review…" loading />
      </View>
    );
  }
  if (!conversation) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="document-outline" title="Memory not found" />
      </View>
    );
  }

  const items: ReviewItem[] = [
    ...conversation.commitments
      .filter((item) => item.approvalStatus === "pending")
      .map((item) => ({ type: "commitment" as const, item })),
    ...conversation.decisions
      .filter((item) => item.approvalStatus === "pending")
      .map((item) => ({ type: "decision" as const, item })),
    ...memories.map((item) => ({ type: "memory" as const, item })),
  ];

  async function apply(
    target: ReviewItem,
    approvalStatus: "approved" | "rejected" | "corrected" | "sensitive",
    text?: string,
  ): Promise<void> {
    if (target.type === "commitment") {
      await setCommitmentApproval(target.item.id, approvalStatus, text ? { text } : undefined);
    } else if (target.type === "decision") {
      await setDecisionApproval(target.item.id, approvalStatus, text ? { text } : undefined);
    } else {
      await setPersonMemoryApproval(target.item.id, approvalStatus, text ? { text } : undefined);
    }
    await refreshMemoryReviewCount(conversation!.id);
    setEditingId(null);
    await load();
  }

  function askExpire(target: ReviewItem): void {
    Alert.alert("Set expiration", "How long should this stay in durable memory?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "7 days",
        onPress: () => void expire(target, 7),
      },
      {
        text: "30 days",
        onPress: () => void expire(target, 30),
      },
    ]);
  }

  async function mergePerson(target: ReviewItem): Promise<void> {
    if (target.type !== "memory") {
      Alert.alert("Merge person", "Person merge applies to remembered facts.");
      return;
    }
    const people = await listPeople();
    if (!people.length) {
      Alert.alert("No people yet", "Name a participant first, then merge this fact.");
      return;
    }
    Alert.alert(
      "Merge with person",
      "Choose who this memory belongs to.",
      [
        { text: "Cancel", style: "cancel" },
        ...people.slice(0, 5).map((person) => ({
          text: person.name,
          onPress: () => void (async () => {
            await setPersonMemoryApproval(target.item.id, "approved", {
              personId: person.id,
            });
            await refreshMemoryReviewCount(conversation!.id);
            await load();
          })(),
        })),
      ],
    );
  }

  async function expire(target: ReviewItem, days: number): Promise<void> {
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    if (target.type === "commitment") {
      await setCommitmentApproval(target.item.id, "approved", { expiresAt });
    } else if (target.type === "memory") {
      await setPersonMemoryApproval(target.item.id, "approved", { expiresAt });
    } else {
      await setDecisionApproval(target.item.id, "approved");
    }
    await refreshMemoryReviewCount(conversation!.id);
    await load();
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
        Memory found {items.length} thing{items.length === 1 ? "" : "s"} worth remembering
      </Text>
      <Text style={[styles.subheading, { color: colors.muted }]}>
        Approve what should become durable memory. Transcript stays either way.
      </Text>

      {items.length === 0 ? (
        <SoftCard>
          <InlineState
            icon="shield-checkmark-outline"
            title="All caught up"
            body="Nothing left to review for this conversation."
          />
          <Pressable
            onPress={() => router.replace(`/conversation/${conversation.id}` as never)}
            style={[styles.primary, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.primaryText}>Open memory</Text>
          </Pressable>
        </SoftCard>
      ) : (
        items.map((target) => {
          const idKey =
            target.type === "commitment" ? target.item.id
              : target.type === "decision" ? target.item.id
                : target.item.id;
          const text =
            target.type === "commitment" ? target.item.text
              : target.type === "decision" ? target.item.text
                : target.item.text;
          const kindLabel =
            target.type === "commitment" ? "Commitment"
              : target.type === "decision" ? "Decision"
                : `Memory · ${target.item.kind}`;
          const quote =
            target.type === "memory" ? target.item.quote
              : target.item.quote;
          const startMs =
            target.type === "memory" ? target.item.startMs
              : target.item.startMs;
          const speakerLabel =
            target.type === "memory" ? target.item.speakerLabel
              : target.item.speakerLabel;
          const confidence =
            target.type === "memory" ? target.item.confidence
              : target.item.confidence;
          const memoryClass =
            target.type === "memory" ? target.item.memoryClass
              : target.type === "commitment" ? target.item.memoryClass
                : target.item.memoryClass;

          return (
            <SoftCard key={`${target.type}:${idKey}`}>
              <Text style={[styles.kind, { color: colors.accent }]}>{kindLabel}</Text>
              <Text style={[styles.classLabel, { color: colors.faint }]}>
                {memoryClass === "transcript_fact" ? "Transcript fact" : "AI inference"}
              </Text>
              {editingId === idKey ? (
                <TextInput
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surfaceMuted }]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                />
              ) : (
                <Text style={[styles.text, { color: colors.ink }]}>{text}</Text>
              )}
              <EvidenceCard
                quote={quote}
                speakerLabel={speakerLabel}
                startMs={startMs}
                confidence={confidence}
                playing={clip.playing && activeMs === startMs}
                available={clip.available}
                onPlay={() => {
                  setActiveMs(startMs);
                  if (startMs != null) void clip.playFrom(startMs);
                }}
              />
              <View style={styles.actions}>
                {editingId === idKey ? (
                  <Pressable
                    onPress={() => void apply(target, "corrected", editText.trim() || text)}
                    style={[styles.btn, { backgroundColor: colors.accent }]}
                  >
                    <Text style={[styles.btnText, { color: colors.background }]}>Save correction</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      onPress={() => void apply(target, "approved")}
                      style={[styles.btn, { backgroundColor: colors.sageSoft }]}
                    >
                      <Ionicons name="checkmark" size={16} color={colors.sage} />
                      <Text style={[styles.btnText, { color: colors.sage }]}>Approve</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingId(idKey);
                        setEditText(text);
                      }}
                      style={[styles.btn, { backgroundColor: colors.surfaceMuted }]}
                    >
                      <Text style={[styles.btnText, { color: colors.ink }]}>Correct</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void apply(target, "rejected")}
                      style={[styles.btn, { backgroundColor: colors.dangerSoft }]}
                    >
                      <Text style={[styles.btnText, { color: colors.danger }]}>Reject</Text>
                    </Pressable>
                  </>
                )}
              </View>
              <View style={styles.secondaryActions}>
                <Pressable onPress={() => void apply(target, "sensitive")}>
                  <Text style={[styles.link, { color: colors.muted }]}>Mark sensitive</Text>
                </Pressable>
                <Pressable onPress={() => askExpire(target)}>
                  <Text style={[styles.link, { color: colors.muted }]}>Set expiration</Text>
                </Pressable>
                {target.type === "memory" ? (
                  <Pressable onPress={() => void mergePerson(target)}>
                    <Text style={[styles.link, { color: colors.muted }]}>Merge person</Text>
                  </Pressable>
                ) : null}
              </View>
            </SoftCard>
          );
        })
      )}

      {items.length > 0 ? (
        <Pressable
          onPress={() => router.replace(`/conversation/${conversation.id}` as never)}
          style={[styles.primary, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.primaryText}>Continue to memory</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  heading: { fontSize: typeScale.title2, fontWeight: "800", letterSpacing: -0.4, lineHeight: 32 },
  subheading: { fontSize: typeScale.body, lineHeight: 22 },
  kind: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  classLabel: { fontSize: 12, marginTop: 2 },
  text: { fontSize: typeScale.bodyLarge, fontWeight: "700", lineHeight: 24, marginTop: spacing.xs },
  input: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.sm,
    minHeight: 72,
    fontSize: typeScale.body,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  btn: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  btnText: { fontSize: 13, fontWeight: "700" },
  secondaryActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  link: { fontSize: 13, fontWeight: "600" },
  primary: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
