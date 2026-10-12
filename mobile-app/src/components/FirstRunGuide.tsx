import type { Ionicons } from "@expo/vector-icons";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { connectGoogle } from "../services/cloudAuth";
import { connectCalendar } from "../services/googleWorkspace";
import { useAuthStore } from "../store/useAuthStore";
import { GOALS, goalCaption, homePriority, joinGoals } from "../utils/goals";
import { spacing, useAppTheme } from "../theme";
import { CalendarScene, CaptureScene, CelebrateScene, MemoryCardsScene, MicScene, PrivacyScene } from "./illustrations/scenes";
import { OnboardingFrame, type FrameAction } from "./onboarding/OnboardingFrame";
import { ChoicePill, LiveCaption, NameField, OptionCard, PromiseRow, StatusLine, SummaryCard } from "./onboarding/parts";

export type OnboardingDetails = {
  name: string;
  occupation: string;
  onboardingGoal: string;
};

type FirstRunGuideProps = {
  onFinish: (destination: "home" | "record", details?: OnboardingDetails) => Promise<void>;
};

const GOAL_OPTIONS: { goal: string; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { goal: GOALS.conversations, icon: "chatbubbles-outline", description: "Find what was said, weeks later." },
  { goal: GOALS.commitments, icon: "checkmark-done-outline", description: "Never drop a promise you made." },
  { goal: GOALS.people, icon: "people-outline", description: "Walk into every meeting prepared." },
  { goal: GOALS.ideas, icon: "bulb-outline", description: "Think out loud, keep the good parts." },
];

const ROLES = ["Founder", "Professional", "Student", "Freelancer", "Parent"] as const;

type StepId = "welcome" | "name" | "goals" | "demo" | "privacy" | "calendar" | "mic" | "ready";

const GOAL_SHORT: Record<string, string> = {
  conversations: "Conversations",
  commitments: "Commitments",
  people: "People",
  ideas: "Ideas",
};

export function FirstRunGuide({ onFinish }: FirstRunGuideProps) {
  const { colors } = useAppTheme();
  const cloudStatus = useAuthStore((state) => state.status);
  const calendarStatus = useAuthStore((state) => state.calendarStatus);
  const calendarEmail = useAuthStore((state) => state.calendarEmail ?? state.email);

  const steps = useMemo<StepId[]>(() => [
    "welcome", "name", "goals", "demo", "privacy",
    ...(cloudStatus === "unavailable" ? [] : ["calendar" as const]),
    "mic", "ready",
  ], [cloudStatus]);

  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [name, setName] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [mic, setMic] = useState<"unknown" | "granted" | "denied">("unknown");

  const step = steps[Math.min(index, steps.length - 1)]!;
  const progress = (Math.min(index, steps.length - 1) + 1) / steps.length;
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const calendarConnected = calendarStatus === "connected";

  useEffect(() => {
    void getRecordingPermissionsAsync()
      .then((permission) => { if (permission.granted) setMic("granted"); })
      .catch(() => undefined);
  }, []);

  const details = useMemo<OnboardingDetails>(() => ({
    name: name.trim(),
    occupation: role ?? "",
    onboardingGoal: joinGoals(goals),
  }), [goals, name, role]);

  function next(): void {
    void Haptics.selectionAsync();
    setIndex((value) => Math.min(value + 1, steps.length - 1));
  }

  function back(): void {
    void Haptics.selectionAsync();
    setIndex((value) => Math.max(value - 1, 0));
  }

  async function finish(destination: "home" | "record"): Promise<void> {
    if (finishing) return;
    setFinishing(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      // Whatever they typed is kept, even when skipping.
      await onFinish(destination, details);
    } finally {
      setFinishing(false);
    }
  }

  function toggleGoal(goal: string): void {
    void Haptics.selectionAsync();
    setGoals((current) => (current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal]));
  }

  async function connect(): Promise<void> {
    setConnecting(true);
    setCalendarError(null);
    try {
      if (useAuthStore.getState().status !== "signedIn") {
        const signedIn = await connectGoogle();
        if (!signedIn) return;
      }
      if (await connectCalendar()) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (cause) {
      setCalendarError(cause instanceof Error ? cause.message : "Could not connect Google Calendar");
    } finally {
      setConnecting(false);
    }
  }

  async function askMic(): Promise<void> {
    try {
      const permission = await requestRecordingPermissionsAsync();
      setMic(permission.granted ? "granted" : "denied");
      if (permission.granted) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setIndex((value) => Math.min(value + 1, steps.length - 1)), 450);
      }
    } catch {
      setMic("denied");
    }
  }

  const common = {
    stepKey: step,
    progress,
    onBack: index > 0 ? back : undefined,
    onSkip: step === "ready" ? undefined : () => void finish("home"),
  };
  const later = (label = "Maybe later"): FrameAction => ({ label, onPress: next });

  switch (step) {
    case "welcome":
      return (
        <OnboardingFrame
          {...common}
          art={<CaptureScene size={290} />}
          eyebrow="Memory AI"
          title={"Never lose what\nwas said."}
          body="Record a conversation. Memory turns it into a summary, the people involved and every promise made."
          primary={{ label: "Get started", onPress: next }}
          secondary={{ label: "No account needed", onPress: next }}
        />
      );

    case "name":
      return (
        <OnboardingFrame
          {...common}
          eyebrow="Nice to meet you"
          title={"What should we\ncall you?"}
          body="Just a first name is perfect. It makes Memory feel like yours."
          primary={{ label: firstName ? `Continue as ${firstName}` : "Continue", onPress: next }}
          secondary={later("I'll add it later")}
        >
          <NameField value={name} onChange={setName} onSubmit={next} />
        </OnboardingFrame>
      );

    case "goals":
      return (
        <OnboardingFrame
          {...common}
          eyebrow={firstName ? `Tell us, ${firstName}` : "Make it yours"}
          title={"What should Memory\nhelp you with?"}
          primary={{ label: "Continue", onPress: next }}
        >
          <View style={styles.stack}>
            {GOAL_OPTIONS.map((option) => (
              <OptionCard
                key={option.goal}
                icon={option.icon}
                title={option.goal}
                description={option.description}
                selected={goals.includes(option.goal)}
                onPress={() => toggleGoal(option.goal)}
              />
            ))}
            <LiveCaption text={goalCaption(goals)} />
            <Text style={[styles.label, { color: colors.muted }]}>YOUR DAY-TO-DAY · OPTIONAL</Text>
            <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel="Your day-to-day (optional)">
              {ROLES.map((option) => (
                <ChoicePill
                  key={option}
                  label={option}
                  selected={role === option}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setRole((current) => (current === option ? null : option));
                  }}
                />
              ))}
            </View>
          </View>
        </OnboardingFrame>
      );

    case "demo":
      return (
        <OnboardingFrame
          {...common}
          art={<MemoryCardsScene size={310} />}
          eyebrow="Here's the magic"
          title={"Every conversation\nbecomes a memory."}
          body="Ask it anything later: “What did I promise Priya?”"
          primary={{ label: "Love it", onPress: next }}
        />
      );

    case "privacy":
      return (
        <OnboardingFrame
          {...common}
          art={<PrivacyScene size={250} />}
          eyebrow="Your memories, your phone"
          title="Private by default."
          primary={{ label: "Sounds good", onPress: next, icon: "shield-checkmark" }}
        >
          <View style={styles.stack}>
            <PromiseRow icon="phone-portrait-outline" title="Lives on this device" body="Your memory library is stored here, not on our servers." />
            <PromiseRow icon="flash-outline" title="Processed, then removed" body="Audio is sent only to transcribe, then deleted from the server." />
            <PromiseRow icon="trash-outline" title="Yours to delete" body="Remove any memory, or everything, at any time." />
          </View>
        </OnboardingFrame>
      );

    case "calendar":
      return (
        <OnboardingFrame
          {...common}
          art={<CalendarScene size={260} />}
          eyebrow="Optional"
          title={"Bring your meetings\nalong."}
          body="Sign in with Google to get 5,000 free AI tokens, see what's next on your calendar and import Google Meet transcripts."
          primary={calendarConnected
            ? { label: "Continue", onPress: next }
            : { label: "Connect Google Calendar", icon: "logo-google", onPress: () => void connect(), busy: connecting }}
          secondary={calendarConnected ? undefined : later()}
        >
          {calendarConnected ? (
            <StatusLine tone="success" text={calendarEmail ? `Connected as ${calendarEmail}` : "Calendar connected"} />
          ) : calendarError ? (
            <StatusLine tone="error" text={calendarError} />
          ) : (
            <StatusLine tone="info" text="Read-only. You can disconnect anytime." />
          )}
        </OnboardingFrame>
      );

    case "mic":
      return (
        <OnboardingFrame
          {...common}
          art={<MicScene size={250} />}
          eyebrow="One last thing"
          title={"Memory only listens\nwhen you tap."}
          body="No background listening, ever. You start and stop every recording."
          primary={mic === "granted"
            ? { label: "Continue", onPress: next }
            : mic === "denied"
              ? { label: "Open Settings", icon: "settings-outline", onPress: () => void Linking.openSettings() }
              : { label: "Allow microphone", icon: "mic", onPress: () => void askMic() }}
          secondary={mic === "granted" ? undefined : later(mic === "denied" ? "Continue without it" : "Not now")}
        >
          {mic === "granted" ? <StatusLine tone="success" text="Microphone ready" /> : null}
          {mic === "denied" ? <StatusLine tone="info" text="You can turn it on in Settings whenever you're ready." /> : null}
        </OnboardingFrame>
      );

    case "ready": {
      const leads = homePriority(goals).map((key) => GOAL_SHORT[key]).join(", ");
      return (
        <OnboardingFrame
          {...common}
          art={<CelebrateScene size={220} />}
          eyebrow="All set"
          title={firstName ? `Welcome in,\n${firstName}.` : "You're all set."}
          body="Your first memory takes a minute. Try it on your next chat, call or meeting."
          primary={{ label: "Record your first memory", icon: "mic", onPress: () => void finish("record"), busy: finishing }}
          secondary={{ label: "Look around first", onPress: () => void finish("home"), disabled: finishing }}
        >
          <SummaryCard
            rows={[
              { icon: "sparkles-outline", label: "Leading with", value: leads },
              ...(steps.includes("calendar")
                ? [{ icon: "calendar-outline" as const, label: "Calendar", value: calendarConnected ? "Connected" : "Not yet" }]
                : []),
              { icon: "mic-outline" as const, label: "Microphone", value: mic === "granted" ? "Ready" : "Ask when recording" },
            ]}
          />
        </OnboardingFrame>
      );
    }
  }
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
});
