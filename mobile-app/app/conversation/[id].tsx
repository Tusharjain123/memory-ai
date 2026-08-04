import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteConversation,
  deleteRecording,
  getConversation,
  setActionItemCompleted,
  type ConversationDetail,
} from "../../src/db/conversations";
import { askWithContext, retrieveMemories } from "../../src/services/ai";
import { exportConversation } from "../../src/services/privacy";
import { AvatarStack, InlineState, PrivacyPill, SectionHeader, SegmentedControl, SoftCard } from "../../src/components/ui";
import { formatDuration, relativeDate } from "../../src/utils/format";
import { radii, spacing, typeScale, useAppTheme } from "../../src/theme";

type DetailTab = "overview" | "transcript" | "ask" | "more";
type TranscriptMode = "raw" | "clean" | "roman";

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [item, setItem] = useState<ConversationDetail | null>();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [transcriptMode, setTranscriptMode] = useState<TranscriptMode>("raw");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => { if (id) void getConversation(id).then(setItem); }, [id]);

  if (item === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="sparkles" title="Opening memory…" loading />
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="document-outline" size={34} color={colors.faint} />
        <Text style={[styles.missingTitle, { color: colors.ink }]}>Memory not found</Text>
        <Text style={[styles.missingBody, { color: colors.muted }]}>It may have been deleted from this device.</Text>
      </View>
    );
  }

  function confirmDelete(): void {
    Alert.alert("Delete this memory?", "Its notes, transcript, AI index, and local recording will be permanently removed.", [
      { text: "Keep memory", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteConversation(item!.id).then(() => router.replace("/")) },
    ]);
  }

  function confirmDeleteRecording(): void {
    Alert.alert("Remove original audio?", "The transcript and insights will stay available.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove audio",
        style: "destructive",
        onPress: () => void deleteRecording(item!.id).then(() =>
          setItem((current) => current ? { ...current, recordingUri: null } : current),
        ),
      },
    ]);
  }

  async function ask(): Promise<void> {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const context = await retrieveMemories(question, item!.id);
      setAnswer((await askWithContext(question, context)).answer);
    } catch (cause) {
      Alert.alert("Memory couldn’t answer", cause instanceof Error ? cause.message : "Try again in a moment.");
    } finally {
      setAsking(false);
    }
  }

  async function toggleAction(actionId: string, completed: boolean): Promise<void> {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setActionItemCompleted(actionId, completed);
    setItem((current) => current ? {
      ...current,
      actionItems: current.actionItems.map((action) => action.id === actionId ? { ...action, completed } : action),
    } : current);
  }

  const pendingActions = item.actionItems.filter((action) => !action.completed);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.metadata}>
          <Text style={[styles.date, { color: colors.muted }]}>{relativeDate(item.createdAt)} · {formatDuration(item.durationMs)}</Text>
          <PrivacyPill compact />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{item.title}</Text>
        {item.topics.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics}>
            {item.topics.map((topic) => (
              <View key={topic} style={[styles.topic, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.topicText, { color: colors.muted }]}>{topic}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview" },
          { value: "transcript", label: "Transcript" },
          { value: "ask", label: "Ask" },
          { value: "more", label: "More" },
        ]}
      />

      {tab === "overview" ? (
        <View>
          <SectionHeader title="Summary" />
          <SoftCard>
            <Text selectable style={[styles.summary, { color: colors.ink }]}>{item.summary}</Text>
            {item.mainGoal ? (
              <View style={[styles.goal, { borderTopColor: colors.line }]}>
                <View style={[styles.goalIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="compass-outline" size={19} color={colors.accent} />
                </View>
                <View style={styles.goalCopy}>
                  <Text style={[styles.microLabel, { color: colors.faint }]}>WHY THIS CONVERSATION HAPPENED</Text>
                  <Text style={[styles.goalText, { color: colors.ink }]}>{item.mainGoal}</Text>
                </View>
              </View>
            ) : null}
          </SoftCard>

          <SectionHeader title={`Action items${pendingActions.length ? ` · ${pendingActions.length} open` : ""}`} />
          <SoftCard>
            {item.actionItems.length ? item.actionItems.map((action, index) => (
              <Pressable
                key={action.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: action.completed }}
                accessibilityLabel={`${action.task}${action.owner ? `, owned by ${action.owner}` : ""}`}
                onPress={() => void toggleAction(action.id, !action.completed)}
                style={({ pressed }) => [
                  styles.actionRow,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
                  pressed && { opacity: 0.55 },
                ]}
              >
                <View style={[styles.checkbox, { borderColor: action.completed ? colors.sage : colors.faint }, action.completed && { backgroundColor: colors.sage }]}>
                  {action.completed ? <Ionicons name="checkmark" size={15} color={colors.background} /> : null}
                </View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionText, { color: action.completed ? colors.faint : colors.ink, textDecorationLine: action.completed ? "line-through" : "none" }]}>{action.task}</Text>
                  {action.owner || action.dueAt ? (
                    <Text style={[styles.actionMeta, { color: colors.muted }]}>{[action.owner, action.dueAt].filter(Boolean).join(" · ")}</Text>
                  ) : null}
                </View>
              </Pressable>
            )) : <InlineState icon="checkmark-circle-outline" title="No action items" body="Nothing from this conversation needs your attention." />}
          </SoftCard>

          <SectionHeader title={`Decisions · ${item.decisions.length}`} />
          <SoftCard>
            {item.decisions.length ? item.decisions.map((decision, index) => (
              <View key={decision.id} style={[styles.decisionRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
                <View style={[styles.decisionIcon, { backgroundColor: colors.sageSoft }]}>
                  <Ionicons name="git-branch-outline" size={17} color={colors.sage} />
                </View>
                <Text style={[styles.decisionText, { color: colors.ink }]}>{decision.text}</Text>
              </View>
            )) : <InlineState icon="git-branch-outline" title="No decisions captured" body="Memory didn’t detect a final decision here." />}
          </SoftCard>

          <SectionHeader title="People" />
          <SoftCard>
            {item.participants.length ? (
              <View style={styles.peopleRow}>
                <AvatarStack names={item.people} max={5} />
                <Text style={[styles.peopleNames, { color: colors.ink }]}>{item.people.join(", ")}</Text>
              </View>
            ) : <InlineState icon="person-outline" title="No named participants" body="Speaker labels remain available in the transcript." />}
          </SoftCard>
        </View>
      ) : null}

      {tab === "transcript" ? (
        <View style={styles.tabContent}>
          <SegmentedControl
            value={transcriptMode}
            onChange={setTranscriptMode}
            options={[
              { value: "raw", label: "Original" },
              { value: "clean", label: "Clean" },
              { value: "roman", label: "Hinglish" },
            ]}
          />
          <View style={styles.timeline}>
            {item.segments.map((segment, index) => (
              <View key={segment.id} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: index % 2 ? colors.accent : colors.sage }]} />
                  {index < item.segments.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.line }]} /> : null}
                </View>
                <View style={[styles.segmentCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.segmentMeta}>
                    <Text style={[styles.speaker, { color: colors.ink }]}>{segment.speakerLabel}</Text>
                    <Text style={[styles.timestamp, { color: colors.faint }]}>{Math.floor(segment.startMs / 60000)}:{String(Math.floor(segment.startMs / 1000) % 60).padStart(2, "0")}</Text>
                  </View>
                  <Text selectable style={[styles.segmentText, { color: colors.ink }]}>
                    {transcriptMode === "raw" ? segment.rawText : transcriptMode === "roman" ? segment.romanHinglishText : segment.cleanText}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {tab === "ask" ? (
        <View style={styles.tabContent}>
          <View style={styles.askIntro}>
            <View style={[styles.askIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="sparkles" size={25} color={colors.accent} />
            </View>
            <Text style={[styles.askHeading, { color: colors.ink }]}>Ask about this memory</Text>
            <Text style={[styles.askSubheading, { color: colors.muted }]}>Answers use only this conversation and link back to its transcript.</Text>
          </View>
          {[
            "What was the main outcome?",
            "Who agreed to do what?",
            "What concerns were raised?",
          ].map((prompt) => (
            <Pressable key={prompt} onPress={() => setQuestion(prompt)} style={[styles.prompt, { borderBottomColor: colors.line }]}>
              <Text style={[styles.promptText, { color: colors.ink }]}>{prompt}</Text>
              <Ionicons name="arrow-forward" size={17} color={colors.faint} />
            </Pressable>
          ))}
          <View style={[styles.composer, { backgroundColor: colors.surface }]}>
            <TextInput
              accessibilityLabel="Question about this memory"
              style={[styles.askInput, { color: colors.ink }]}
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask about this conversation…"
              placeholderTextColor={colors.faint}
              onSubmitEditing={() => void ask()}
              multiline
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send question"
              disabled={!question.trim() || asking}
              onPress={() => void ask()}
              style={[styles.send, { backgroundColor: question.trim() ? colors.ink : colors.surfaceMuted }]}
            >
              <Ionicons name="arrow-up" size={19} color={question.trim() ? colors.background : colors.faint} />
            </Pressable>
          </View>
          {asking ? <InlineState icon="sparkles" title="Reading this memory…" loading /> : null}
          {answer ? (
            <View style={[styles.answer, { backgroundColor: colors.sageSoft }]}>
              <Ionicons name="sparkles" size={19} color={colors.sage} />
              <Text selectable style={[styles.answerText, { color: colors.ink }]}>{answer}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === "more" ? (
        <View style={styles.tabContent}>
          <View style={[styles.privateCard, { backgroundColor: colors.sageSoft }]}>
            <Ionicons name="lock-closed" size={25} color={colors.sage} />
            <View style={styles.privateCopy}>
              <Text style={[styles.privateTitle, { color: colors.ink }]}>Private by default</Text>
              <Text style={[styles.privateBody, { color: colors.muted }]}>This memory and its AI index live only on this device.</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void exportConversation(item).catch((cause: unknown) => Alert.alert("Couldn’t export", cause instanceof Error ? cause.message : "Try again"))} style={[styles.menuRow, { borderBottomColor: colors.line }]}>
            <View style={[styles.menuIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="share-outline" size={20} color={colors.ink} /></View>
            <View style={styles.menuCopy}><Text style={[styles.menuTitle, { color: colors.ink }]}>Export memory</Text><Text style={[styles.menuBody, { color: colors.muted }]}>Share a readable Markdown copy</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
          {item.recordingUri ? (
            <Pressable accessibilityRole="button" onPress={confirmDeleteRecording} style={[styles.menuRow, { borderBottomColor: colors.line }]}>
              <View style={[styles.menuIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="mic-off-outline" size={20} color={colors.ink} /></View>
              <View style={styles.menuCopy}><Text style={[styles.menuTitle, { color: colors.ink }]}>Remove original audio</Text><Text style={[styles.menuBody, { color: colors.muted }]}>Keep transcript and insights</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.dangerSoft }]}><Ionicons name="trash-outline" size={20} color={colors.danger} /></View>
            <View style={styles.menuCopy}><Text style={[styles.menuTitle, { color: colors.danger }]}>Delete memory</Text><Text style={[styles.menuBody, { color: colors.muted }]}>Permanently remove it from this device</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  missingTitle: { fontSize: typeScale.title3, fontWeight: "800", marginTop: spacing.md },
  missingBody: { fontSize: typeScale.body, marginTop: spacing.xs, textAlign: "center" },
  hero: { paddingVertical: spacing.md },
  metadata: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  date: { fontSize: typeScale.caption, fontWeight: "600" },
  title: { fontSize: typeScale.title1, lineHeight: 40, fontWeight: "800", letterSpacing: -1.1, marginTop: spacing.md },
  topics: { gap: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.xs },
  topic: { minHeight: 30, borderRadius: radii.pill, justifyContent: "center", paddingHorizontal: spacing.sm },
  topicText: { fontSize: typeScale.caption, fontWeight: "600" },
  summary: { fontSize: 17, lineHeight: 26 },
  goal: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, paddingTop: spacing.lg },
  goalIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  goalCopy: { flex: 1 },
  microLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  goalText: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  actionRow: { minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.sm },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  actionCopy: { flex: 1 },
  actionText: { fontSize: typeScale.body, lineHeight: 21, fontWeight: "600" },
  actionMeta: { fontSize: typeScale.caption, marginTop: 3 },
  decisionRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  decisionIcon: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  decisionText: { flex: 1, fontSize: typeScale.body, lineHeight: 21 },
  peopleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  peopleNames: { flex: 1, fontSize: typeScale.body, lineHeight: 21, fontWeight: "600" },
  tabContent: { paddingTop: spacing.xl },
  timeline: { marginTop: spacing.xl },
  timelineRow: { flexDirection: "row", gap: spacing.sm },
  timelineRail: { width: 18, alignItems: "center" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 18 },
  timelineLine: { flex: 1, width: 1, marginVertical: 4 },
  segmentCard: { flex: 1, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  segmentMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  speaker: { fontSize: 13, fontWeight: "800" },
  timestamp: { fontSize: 11, fontVariant: ["tabular-nums"] },
  segmentText: { fontSize: typeScale.body, lineHeight: 23 },
  askIntro: { alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  askIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  askHeading: { fontSize: typeScale.title2, fontWeight: "800", letterSpacing: -0.5, marginTop: spacing.md },
  askSubheading: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: spacing.xs },
  prompt: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  promptText: { flex: 1, fontSize: 14, fontWeight: "600" },
  composer: { minHeight: 58, maxHeight: 120, borderRadius: 20, flexDirection: "row", alignItems: "flex-end", paddingLeft: spacing.md, paddingRight: 7, paddingVertical: 7, marginTop: spacing.xl },
  askInput: { flex: 1, minHeight: 44, maxHeight: 100, fontSize: typeScale.body, lineHeight: 21, paddingTop: 11 },
  send: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  answer: { borderRadius: radii.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, marginTop: spacing.md },
  answerText: { flex: 1, fontSize: typeScale.body, lineHeight: 23 },
  privateCard: { borderRadius: radii.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, marginBottom: spacing.lg },
  privateCopy: { flex: 1 },
  privateTitle: { fontSize: 15, fontWeight: "800" },
  privateBody: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  menuRow: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  menuIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  menuCopy: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: "700" },
  menuBody: { fontSize: 12, marginTop: 3 },
});
