import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  clearAskTurns,
  completeAskTurn,
  createAskTurn,
  failAskTurn,
  listAskTurns,
} from "../src/db/askTurns";
import type { SearchMemory } from "../src/db/insights";
import { PlayableEvidence } from "../src/components/PlayableEvidence";
import { SectionHeader } from "../src/components/ui";
import {
  askGlobalWithContext,
  retrieveMemories,
  turnsToHistory,
  type AskTurn,
} from "../src/services/ai";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

const SUGGESTIONS = [
  { icon: "checkmark-done-outline" as const, text: "What have I promised?" },
  { icon: "people-outline" as const, text: "What did Rahul promise?" },
  { icon: "sparkles-outline" as const, text: "Prepare me for Priya" },
  { icon: "git-branch-outline" as const, text: "What decisions were made recently?" },
];

function recentQuestionsFromTurns(turns: AskTurn[]): string[] {
  return [...turns]
    .reverse()
    .map((turn) => turn.question)
    .filter((question, index, items) => items.indexOf(question) === index)
    .slice(0, 4);
}

export default function AskMemoryScreen() {
  const router = useRouter();
  const { question: routedQuestion, autoSubmit } = useLocalSearchParams<{
    question?: string;
    autoSubmit?: string;
  }>();
  const { colors, isDark } = useAppTheme();
  const [question, setQuestion] = useState(routedQuestion ?? "");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const handledRoutedQuestion = useRef(false);

  const loadTurns = useCallback(async () => {
    setTurns(await listAskTurns(null));
  }, []);

  useFocusEffect(useCallback(() => {
    void loadTurns();
  }, [loadTurns]));

  async function ask(value = question, existingTurnId?: string): Promise<void> {
    const clean = value.trim();
    if (!clean || loading) return;
    void Haptics.selectionAsync();
    setQuestion("");
    setLoading(true);

    let turnId = existingTurnId;
    if (!turnId) {
      turnId = await createAskTurn({ question: clean });
      setTurns((current) => [
        ...current,
        {
          id: turnId!,
          question: clean,
          answer: null,
          citations: [],
          error: null,
          loading: true,
        },
      ]);
    } else {
      setTurns((current) => current.map((turn) => turn.id === turnId
        ? { ...turn, question: clean, answer: null, citations: [], error: null, loading: true }
        : turn));
    }

    try {
      const history = turnsToHistory(
        turns.filter((turn) => turn.id !== turnId && turn.answer && !turn.error),
      );
      const found = await retrieveMemories(clean);
      const response = await askGlobalWithContext(clean, found, history);
      const memories = found.filter((item) => item.conversationId !== "analytics");
      await completeAskTurn(turnId, {
        answer: response.answer,
        citations: response.citations,
      });
      setTurns((current) => current.map((turn) => turn.id === turnId
        ? {
            ...turn,
            answer: response.answer,
            citations: response.citations,
            memories,
            error: null,
            loading: false,
          }
        : turn));
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : "Memory could not answer right now";
      await failAskTurn(turnId, message);
      setTurns((current) => current.map((turn) => turn.id === turnId
        ? { ...turn, error: message, loading: false }
        : turn));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      handledRoutedQuestion.current ||
      autoSubmit !== "1" ||
      !routedQuestion?.trim()
    ) {
      return;
    }
    handledRoutedQuestion.current = true;
    void ask(routedQuestion);
  }, [autoSubmit, routedQuestion]);

  async function clearChat(): Promise<void> {
    await clearAskTurns(null);
    setTurns([]);
    setQuestion("");
  }

  const recentQuestions = recentQuestionsFromTurns(turns);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <View style={[styles.sparkle, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="sparkles" size={27} color={colors.accent} />
          </View>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>Ask your memory</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>Ask naturally. Answers are grounded in memories stored on this device.</Text>
        </View>

        {turns.length === 0 ? (
          <>
            <Text style={[styles.promptLabel, { color: colors.faint }]}>TRY ASKING</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion.text}
                  accessibilityRole="button"
                  onPress={() => void ask(suggestion.text)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    { backgroundColor: colors.surface },
                    !isDark && shadows.card,
                    pressed && { opacity: 0.7, transform: [{ scale: 0.99 }] },
                  ]}
                >
                  <Ionicons name={suggestion.icon} size={19} color={colors.sage} />
                  <Text style={[styles.suggestionText, { color: colors.ink }]}>{suggestion.text}</Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.faint} />
                </Pressable>
              ))}
            </View>

            {recentQuestions.length ? (
              <View style={styles.recent}>
                <SectionHeader title="Recent questions" />
                {recentQuestions.map((recent) => (
                  <Pressable
                    key={recent}
                    accessibilityRole="button"
                    onPress={() => void ask(recent)}
                    style={styles.recentRow}
                  >
                    <Ionicons name="time-outline" size={18} color={colors.faint} />
                    <Text numberOfLines={1} style={[styles.recentText, { color: colors.muted }]}>{recent}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.thread}>
            {turns.map((turn) => (
              <View key={turn.id} style={styles.turnBlock}>
                <View style={styles.userMessageRow}>
                  <View style={[styles.userMessage, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.userMessageText, { color: colors.ink }]}>{turn.question}</Text>
                  </View>
                </View>

                {turn.loading ? (
                  <View style={styles.thinking}>
                    <View style={[styles.answerAvatar, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name="sparkles" size={18} color={colors.accent} />
                    </View>
                    <View style={styles.thinkingCopy}>
                      <ActivityIndicator size="small" color={colors.accent} />
                      <Text style={[styles.thinkingText, { color: colors.muted }]}>Looking through your memories…</Text>
                    </View>
                  </View>
                ) : null}

                {turn.error ? (
                  <View style={[styles.errorCard, { backgroundColor: colors.dangerSoft }]}>
                    <Ionicons name="cloud-offline-outline" size={21} color={colors.danger} />
                    <View style={styles.errorCopy}>
                      <Text style={[styles.errorTitle, { color: colors.ink }]}>Couldn’t reach Memory</Text>
                      <Text style={[styles.errorBody, { color: colors.muted }]}>{turn.error}</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void ask(turn.question, turn.id)}
                        style={styles.retryButton}
                      >
                        <Text style={[styles.retryText, { color: colors.accent }]}>Try again</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {turn.answer ? (
                  <View style={styles.answerBlock}>
                    <View style={[styles.answerAvatar, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name="sparkles" size={18} color={colors.accent} />
                    </View>
                    <View style={styles.answerCopy}>
                      <Text style={[styles.answerName, { color: colors.ink }]}>Memory</Text>
                      <Text selectable style={[styles.answerText, { color: colors.ink }]}>{turn.answer}</Text>
                    </View>
                  </View>
                ) : null}

                {turn.memories?.length && turn.answer ? (
                  <View style={styles.sourcesBlock}>
                    <SectionHeader title="Sources" />
                    <View style={{ gap: 10 }}>
                      {turn.memories.slice(0, 6).map((item) => (
                        <View key={`${turn.id}:${item.conversationId}:${item.id}`}>
                          <Pressable
                            accessibilityRole="link"
                            accessibilityLabel={`Open source ${item.title}`}
                            onPress={() => router.push(`/conversation/${item.conversationId}`)}
                            style={({ pressed }) => [
                              styles.sourceCard,
                              { backgroundColor: colors.surface, width: "100%" },
                              !isDark && shadows.card,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <View style={styles.sourceTop}>
                              <Ionicons name="document-text-outline" size={17} color={colors.sage} />
                              <Text style={[styles.sourceType, { color: colors.sage }]}>MEMORY</Text>
                            </View>
                            <Text numberOfLines={2} style={[styles.sourceTitle, { color: colors.ink }]}>{item.title}</Text>
                            <Text numberOfLines={2} style={[styles.sourceText, { color: colors.muted }]}>{item.text}</Text>
                          </Pressable>
                          {item.quote || item.startMs != null ? (
                            <PlayableEvidence
                              recordingUri={item.recordingUri}
                              quote={item.quote ?? null}
                              speakerLabel={item.speakerLabel ?? null}
                              startMs={item.startMs ?? null}
                              confidence={(item.confidence as "low" | "medium" | "high" | null | undefined) ?? null}
                            />
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ))}

            {!loading ? (
              <Pressable accessibilityRole="button" onPress={() => void clearChat()} style={styles.newQuestion}>
                <Ionicons name="trash-outline" size={19} color={colors.accent} />
                <Text style={[styles.newQuestionText, { color: colors.accent }]}>Clear chat</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>

      <KeyboardStickyView
        style={[styles.composerWrap, { backgroundColor: colors.background, borderTopColor: colors.line }]}
      >
        <View style={[styles.composer, { backgroundColor: colors.surface }, !isDark && shadows.floating]}>
          <TextInput
            accessibilityLabel="Ask Memory"
            style={[styles.input, { color: colors.ink }]}
            placeholder="Ask anything about your memories…"
            placeholderTextColor={colors.faint}
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => void ask()}
            returnKeyType="send"
            multiline
            maxLength={1000}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send question"
            disabled={!question.trim() || loading}
            onPress={() => void ask()}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: question.trim() && !loading ? colors.ink : colors.surfaceMuted },
              pressed && { transform: [{ scale: 0.93 }] },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={question.trim() && !loading ? colors.background : colors.faint} />
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 124 },
  intro: { alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  sparkle: { width: 60, height: 60, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1, textAlign: "center" },
  subheading: { maxWidth: 340, fontSize: typeScale.body, lineHeight: 22, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  promptLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, marginBottom: spacing.sm },
  suggestions: { gap: spacing.sm },
  suggestion: { minHeight: 60, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  suggestionText: { flex: 1, fontSize: typeScale.body, fontWeight: "600" },
  recent: { marginTop: spacing.sm },
  recentRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  recentText: { flex: 1, fontSize: 14 },
  thread: { gap: spacing.xl },
  turnBlock: { gap: spacing.md },
  userMessageRow: { alignItems: "flex-end" },
  userMessage: { maxWidth: "88%", borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  userMessageText: { fontSize: typeScale.body, lineHeight: 22 },
  thinking: { flexDirection: "row", gap: spacing.sm },
  answerAvatar: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  thinkingCopy: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 36 },
  thinkingText: { fontSize: 14 },
  errorCard: { flexDirection: "row", gap: spacing.sm, borderRadius: radii.md, padding: spacing.md },
  errorCopy: { flex: 1 },
  errorTitle: { fontSize: 15, fontWeight: "800" },
  errorBody: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  retryButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  retryText: { fontSize: 14, fontWeight: "800" },
  answerBlock: { flexDirection: "row", gap: spacing.sm },
  answerCopy: { flex: 1 },
  answerName: { fontSize: 13, fontWeight: "800", marginBottom: spacing.xs },
  answerText: { fontSize: 16, lineHeight: 25 },
  sourcesBlock: { marginTop: spacing.sm },
  sourceCard: { width: 240, minHeight: 142, borderRadius: radii.md, padding: spacing.md },
  sourceTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  sourceType: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  sourceTitle: { fontSize: 15, lineHeight: 19, fontWeight: "800", marginTop: spacing.sm },
  sourceText: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  newQuestion: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.xl },
  newQuestionText: { fontSize: 14, fontWeight: "800" },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: Platform.OS === "ios" ? 32 : spacing.lg },
  composer: { minHeight: 56, maxHeight: 112, borderRadius: 22, flexDirection: "row", alignItems: "flex-end", paddingLeft: spacing.md, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, minHeight: 44, maxHeight: 96, fontSize: typeScale.body, lineHeight: 21, paddingTop: 11, paddingBottom: 10 },
  send: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
