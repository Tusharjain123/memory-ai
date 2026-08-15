import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../theme";

export type OnboardingDetails = {
  name: string;
  occupation: string;
  onboardingGoal: string;
};

type FirstRunGuideProps = {
  onFinish: (destination: "home" | "record", details?: OnboardingDetails) => Promise<void>;
};

const OCCUPATIONS = [
  "Founder / business owner",
  "Professional / employee",
  "Student",
  "Freelancer / consultant",
  "Parent / caregiver",
] as const;

const INTERESTS = [
  "Remember conversations",
  "Stay on top of commitments",
  "Prepare for important people",
  "Capture ideas and reflections",
] as const;

const OTHER = "Other";

type QuestionStep = {
  kind: "intro" | "privacy" | "name" | "occupation" | "interests";
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

const STEPS: QuestionStep[] = [
  {
    kind: "intro",
    icon: "sparkles-outline",
    title: "Keep the moments\nthat matter.",
    body: "Record a conversation, then Memory turns it into a clear summary, people, and commitments.",
  },
  {
    kind: "name",
    title: "What should we\ncall you?",
    body: "A name helps Memory personalize how it talks to you. You can change this later.",
  },
  {
    kind: "occupation",
    title: "What best describes\nyour day-to-day?",
    body: "Pick one option, or choose Other and type your own.",
  },
  {
    kind: "interests",
    title: "What should Memory\nhelp with?",
    body: "Select all that apply. You can add your own with Other.",
  },
  {
    kind: "privacy",
    icon: "shield-checkmark-outline",
    title: "Private by\ndefault.",
    body: "Your permanent memory and recording stay on this device. When you finish, audio is sent temporarily for transcription and AI processing, then removed from the processing server.",
  },
];

export function FirstRunGuide({ onFinish }: FirstRunGuideProps) {
  const { colors, isDark } = useAppTheme();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [name, setName] = useState("");
  const [occupationChoice, setOccupationChoice] = useState<string | null>(null);
  const [occupationOther, setOccupationOther] = useState("");
  const [interestChoices, setInterestChoices] = useState<string[]>([]);
  const [interestOther, setInterestOther] = useState("");
  const current = STEPS[step]!;
  const lastStep = step === STEPS.length - 1;
  const questionStep = current.kind === "name" || current.kind === "occupation" || current.kind === "interests";

  const details = useMemo<OnboardingDetails>(() => {
    const occupation = occupationChoice === OTHER
      ? occupationOther.trim()
      : (occupationChoice ?? "").trim();
    const goals = [
      ...interestChoices.filter((item) => item !== OTHER),
      ...(interestChoices.includes(OTHER) && interestOther.trim() ? [interestOther.trim()] : []),
    ];
    return {
      name: name.trim(),
      occupation,
      onboardingGoal: goals.join(" · "),
    };
  }, [interestChoices, interestOther, name, occupationChoice, occupationOther]);

  function toggleInterest(option: string): void {
    void Haptics.selectionAsync();
    setInterestChoices((current) => (
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    ));
  }

  function selectOccupation(option: string): void {
    void Haptics.selectionAsync();
    setOccupationChoice(option);
    if (option !== OTHER) setOccupationOther("");
  }

  async function finish(destination: "home" | "record", saveDetails = false): Promise<void> {
    if (finishing) return;
    setFinishing(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await onFinish(destination, saveDetails ? details : undefined);
    } finally {
      setFinishing(false);
    }
  }

  function goNext(): void {
    if (lastStep) {
      void finish("record", true);
      return;
    }
    void Haptics.selectionAsync();
    setStep((value) => value + 1);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.page, { backgroundColor: colors.background }]}
    >
      <View style={styles.topRow}>
        <Image source={require("../../assets/memory-ai-logo.png")} style={[styles.logo, { borderColor: colors.line }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          disabled={finishing}
          onPress={() => void finish("home")}
          hitSlop={10}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.55 }]}
        >
          <Text style={[styles.skipText, { color: colors.muted }]}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, questionStep && styles.detailsContent]}
      >
        {!questionStep && current.icon ? (
          <View style={[styles.iconStage, { backgroundColor: colors.accentSoft }, !isDark && shadows.floating]}>
            <Ionicons name={current.icon} size={56} color={colors.accent} />
            <View style={[styles.iconBadge, { backgroundColor: colors.sageSoft, borderColor: colors.surface }]}>
              <Ionicons name={step === 0 ? "mic" : "lock-closed"} size={18} color={colors.sage} />
            </View>
          </View>
        ) : null}

        <Text
          accessibilityRole="header"
          style={[styles.title, questionStep && styles.detailsTitle, { color: colors.ink }]}
        >
          {current.title}
        </Text>
        <Text
          style={[
            styles.body,
            questionStep && styles.detailsBody,
            { color: colors.muted },
          ]}
        >
          {current.body}
        </Text>

        {current.kind === "name" ? (
          <View style={styles.form}>
            <TextInput
              accessibilityLabel="Your name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.faint}
              autoCapitalize="words"
              autoFocus
              returnKeyType="next"
              onSubmitEditing={goNext}
              style={[styles.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]}
            />
          </View>
        ) : null}

        {current.kind === "occupation" ? (
          <View style={styles.form}>
            {[...OCCUPATIONS, OTHER].map((option) => {
              const selected = occupationChoice === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => selectOccupation(option)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      backgroundColor: selected ? colors.accentSoft : colors.surface,
                      borderColor: selected ? colors.accent : colors.line,
                    },
                    pressed && { opacity: 0.72 },
                  ]}
                >
                  <Text style={[styles.choiceText, { color: colors.ink }]}>{option}</Text>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={21}
                    color={selected ? colors.accent : colors.faint}
                  />
                </Pressable>
              );
            })}
            {occupationChoice === OTHER ? (
              <TextInput
                accessibilityLabel="Describe your day-to-day"
                value={occupationOther}
                onChangeText={setOccupationOther}
                placeholder="Type your own answer"
                placeholderTextColor={colors.faint}
                autoCapitalize="sentences"
                autoFocus
                style={[styles.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]}
              />
            ) : null}
          </View>
        ) : null}

        {current.kind === "interests" ? (
          <View style={styles.form}>
            {[...INTERESTS, OTHER].map((option) => {
              const selected = interestChoices.includes(option);
              return (
                <Pressable
                  key={option}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleInterest(option)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      backgroundColor: selected ? colors.accentSoft : colors.surface,
                      borderColor: selected ? colors.accent : colors.line,
                    },
                    pressed && { opacity: 0.72 },
                  ]}
                >
                  <Text style={[styles.choiceText, { color: colors.ink }]}>{option}</Text>
                  <Ionicons
                    name={selected ? "checkbox" : "square-outline"}
                    size={21}
                    color={selected ? colors.accent : colors.faint}
                  />
                </Pressable>
              );
            })}
            {interestChoices.includes(OTHER) ? (
              <TextInput
                accessibilityLabel="Describe what Memory should help with"
                value={interestOther}
                onChangeText={setInterestOther}
                placeholder="Type your own answer"
                placeholderTextColor={colors.faint}
                autoCapitalize="sentences"
                autoFocus
                style={[styles.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]}
              />
            ) : null}
          </View>
        ) : null}

        <View accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`} style={styles.dots}>
          {STEPS.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, { backgroundColor: index === step ? colors.accent : colors.line }]}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={finishing}
          onPress={goNext}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.8, transform: [{ scale: 0.985 }] },
          ]}
        >
          <Ionicons name={lastStep ? "mic" : "arrow-forward"} size={20} color="#FFFFFF" />
          <Text style={styles.primaryText}>
            {finishing ? "Opening Memory…" : lastStep ? "Record your first memory" : "Continue"}
          </Text>
        </Pressable>
        {lastStep ? (
          <Pressable
            accessibilityRole="button"
            disabled={finishing}
            onPress={() => void finish("home", true)}
            style={styles.secondaryButton}
          >
            <Text style={[styles.secondaryText, { color: colors.muted }]}>Explore on my own</Text>
          </Pressable>
        ) : questionStep ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep((value) => value + 1)}
            style={styles.secondaryButton}
          >
            <Text style={[styles.secondaryText, { color: colors.muted }]}>Skip for now</Text>
          </Pressable>
        ) : (
          <Text style={[styles.hint, { color: colors.faint }]}>No account or setup required</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: 58, paddingBottom: spacing.xxl },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 44, height: 44, borderRadius: 14, borderWidth: 1 },
  skip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  skipText: { fontSize: typeScale.body, fontWeight: "700" },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.xxl,
  },
  detailsContent: { justifyContent: "flex-start", paddingTop: spacing.xxl, alignItems: "stretch" },
  iconStage: {
    width: 148,
    height: 148,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    alignSelf: "center",
  },
  iconBadge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typeScale.display,
    lineHeight: 50,
    letterSpacing: -1.4,
    fontWeight: "800",
    textAlign: "center",
    marginTop: spacing.xxxl,
  },
  detailsTitle: { fontSize: typeScale.title1, lineHeight: 40, marginTop: 0, textAlign: "left" },
  body: {
    maxWidth: 330,
    fontSize: typeScale.bodyLarge,
    lineHeight: 25,
    textAlign: "center",
    marginTop: spacing.md,
    alignSelf: "center",
  },
  detailsBody: { maxWidth: "100%", textAlign: "left", alignSelf: "stretch" },
  form: { width: "100%", gap: spacing.sm, marginTop: spacing.xl },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typeScale.body,
  },
  choice: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  choiceText: { flex: 1, fontSize: 15, fontWeight: "700" },
  dots: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xxxl, alignSelf: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { gap: spacing.sm },
  primaryButton: {
    minHeight: 60,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  primaryText: { color: "#FFFFFF", fontSize: typeScale.bodyLarge, fontWeight: "800" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: typeScale.body, fontWeight: "700" },
  hint: {
    minHeight: 44,
    fontSize: typeScale.caption,
    fontWeight: "700",
    textAlign: "center",
    textAlignVertical: "center",
  },
});
