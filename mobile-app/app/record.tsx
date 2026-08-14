import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { useNavigation, useRouter } from "expo-router";
import { useSafeAudioRecorderState } from "../src/hooks/useSafeAudioRecorderState";
import { createPendingRecording, setPendingRecordingError } from "../src/db/pendingRecordings";
import { startProcessing } from "../src/services/processing";
import { MAX_RECORDING_MS } from "../src/utils/processingTimeouts";
import { persistRecording } from "../src/services/recordings";
import { useRecordingStore } from "../src/store/useRecordingStore";
import { nextMeterLevels, normalizeMetering } from "../src/utils/audioMeter";
import {
  createDistantMicDetectorState,
  nextDistantMicDetectorState,
} from "../src/utils/distantMicDetector";
import {
  createMuffledDetectorState,
  nextMuffledDetectorState,
} from "../src/utils/muffledDetector";
import { SPEECH_CAPTURE } from "../src/utils/speechRecordingOptions";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

function time(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const EMPTY_LEVELS = Array.from({ length: 28 }, () => 0);
const START_TIMEOUT_MS = 8_000;

/** Mono speech preset — better for ASR/diarization than stereo HIGH_QUALITY. */
const recordingOptions: RecordingOptions = {
  extension: SPEECH_CAPTURE.extension,
  sampleRate: SPEECH_CAPTURE.sampleRate,
  numberOfChannels: SPEECH_CAPTURE.numberOfChannels,
  bitRate: SPEECH_CAPTURE.bitRate,
  isMeteringEnabled: true,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    audioSource: SPEECH_CAPTURE.androidAudioSource,
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: SPEECH_CAPTURE.bitRate,
  },
};

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `${label} timed out. On an Android emulator, open Extended controls → Microphone and enable “Virtual microphone uses host audio input”, or try a physical phone.`,
            ),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function Waveform({ levels, active, color, faint }: { levels: number[]; active: boolean; color: string; faint: string }) {
  return (
    <View style={styles.waveform} accessibilityLabel={active ? "Live audio waveform" : "Audio waveform inactive"}>
      {levels.map((level, index) => (
        <View key={index} style={[styles.waveBar, { height: 8 + level * 48, backgroundColor: active ? color : faint, opacity: active ? 0.95 : 0.38 }]} />
      ))}
    </View>
  );
}

export default function RecordScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const recorder = useAudioRecorder(recordingOptions);
  const { status, error, setStatus, setElapsedMs, setError, reset } = useRecordingStore();
  const recorderState = useSafeAudioRecorderState(recorder, {
    enabled: status === "recording" || status === "paused",
    intervalMs: 80,
    pollWhilePaused: status === "paused",
  });
  const pulse = useRef(new Animated.Value(0)).current;
  const allowExitRef = useRef(false);
  const startingRef = useRef(false);
  const [levels, setLevels] = useState(EMPTY_LEVELS);
  const [starting, setStarting] = useState(false);
  const [muffledHint, setMuffledHint] = useState(false);
  const [distantHint, setDistantHint] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const recordedDurationMsRef = useRef(0);
  const muffledRef = useRef(createMuffledDetectorState());
  const distantRef = useRef(createDistantMicDetectorState());

  useEffect(() => {
    void (async () => {
      try {
        await requestRecordingPermissionsAsync();
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
          interruptionModeAndroid: "doNotMix",
          shouldPlayInBackground: true,
          allowsBackgroundRecording: true,
          shouldRouteThroughEarpiece: false,
        });
      } catch {
        // Permission / audio mode will be retried when the user starts recording.
      }
    })();
  }, []);

  useEffect(() => {
    setElapsedMs(recorderState.durationMillis);
    if (recorderState.durationMillis > 0) {
      recordedDurationMsRef.current = recorderState.durationMillis;
    }
  }, [recorderState.durationMillis, setElapsedMs]);

  useEffect(() => {
    if (
      status === "recording"
      && recorderState.durationMillis >= MAX_RECORDING_MS
    ) {
      Alert.alert(
        "Maximum length reached",
        "Recordings are limited to 3 hours. Saving what you captured.",
      );
      void stop();
    }
  }, [recorderState.durationMillis, status]);
  useEffect(() => {
    if (status !== "recording") {
      muffledRef.current = createMuffledDetectorState();
      distantRef.current = createDistantMicDetectorState();
      setMuffledHint(false);
      setDistantHint(false);
      return;
    }
    if (recorderState.metering === undefined) return;
    const level = normalizeMetering(recorderState.metering);
    setLevels((current) => nextMeterLevels(current, level));
    const muffled = nextMuffledDetectorState(muffledRef.current, level);
    muffledRef.current = muffled;
    setMuffledHint(muffled.muffled);
    const distant = nextDistantMicDetectorState(distantRef.current, level);
    distantRef.current = distant;
    setDistantHint(!muffled.muffled && distant.distant);
  }, [recorderState, status]);
  useEffect(() => () => reset(), [reset]);
  useEffect(() => {
    if (status !== "recording" && status !== "processing") {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, status]);

  async function start(): Promise<void> {
    if (startingRef.current || status === "recording" || status === "paused" || status === "processing") {
      return;
    }
    startingRef.current = true;
    setStarting(true);
    try {
      const permission = await withTimeout(
        requestRecordingPermissionsAsync(),
        START_TIMEOUT_MS,
        "Microphone permission",
      );
      if (!permission.granted) {
        Alert.alert("Microphone access needed", "Allow microphone access to capture a private memory.");
        return;
      }

      if (Platform.OS === "android" && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }

      await withTimeout(
        setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
          interruptionModeAndroid: "doNotMix",
          shouldPlayInBackground: true,
          allowsBackgroundRecording: true,
          shouldRouteThroughEarpiece: false,
        }),
        START_TIMEOUT_MS,
        "Audio mode setup",
      );

      // If a previous attempt left an active recording, stop it first.
      if (recorder.isRecording) {
        await withTimeout(recorder.stop(), 3_000, "Microphone reset");
      }

      await withTimeout(recorder.prepareToRecordAsync(), START_TIMEOUT_MS, "Microphone prepare");
      recorder.record();

      // Give Android a brief moment; then proceed even if isRecording lags behind.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const next = recorder.getStatus();
      if (!next.isRecording && !next.canRecord) {
        throw new Error("Microphone could not start. Check emulator mic settings or try a physical phone.");
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStatus("recording");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not start recording";
      if (recorder.isRecording) {
        try {
          await withTimeout(recorder.stop(), 3_000, "Microphone reset");
        } catch {
          // Best-effort reset so the next attempt can prepare again.
        }
      }
      Alert.alert("Recording failed", message);
      setError(message);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function togglePause(): Promise<void> {
    void Haptics.selectionAsync();
    if (status === "recording") {
      recorder.pause();
      setStatus("paused");
    } else {
      recorder.record();
      setStatus("recording");
    }
  }

  async function stop(): Promise<void> {
    let pendingId: string | undefined;
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus("processing");
      setProcessingProgress(0);
      setLevels(EMPTY_LEVELS);
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("The recording file was not created");
      const savedUri = await persistRecording(uri);
      const pending = await createPendingRecording(
        savedUri,
        recordedDurationMsRef.current || undefined,
      );
      pendingId = pending.id;
      await startProcessing(savedUri, {
        durationMs: recordedDurationMsRef.current,
        pendingId: pending.id,
        onProgress: setProcessingProgress,
      });
      allowExitRef.current = true;
      reset();
      router.replace("/pending" as never);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not process recording";
      if (pendingId) await setPendingRecordingError(pendingId, message);
      setError(`${message}. Your recording is safe on this device.`);
    }
  }

  const active = status === "recording" || status === "paused";
  const processing = status === "processing";

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (allowExitRef.current || !active) return;
    event.preventDefault();
    Alert.alert(
      "Discard this recording?",
      "This recording has not been finished or saved yet.",
      [
        { text: status === "paused" ? "Keep editing" : "Keep recording", style: "cancel" },
        {
          text: "Discard recording",
          style: "destructive",
          onPress: () => {
            void (async () => {
              allowExitRef.current = true;
              setStatus("idle");
              setLevels(EMPTY_LEVELS);
              try { await recorder.stop(); } catch { /* Recorder may already be stopped by the OS. */ }
              reset();
              navigation.dispatch(event.data.action);
            })();
          },
        },
      ],
    );
  }), [active, navigation, recorder, reset, setStatus, status]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}> 
      <View style={styles.topCopy}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}> 
          {processing ? "Creating your memory" : active ? (status === "paused" ? "Recording paused" : "Listening") : "Ready when you are"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {processing
            ? "Finding the summary, people, decisions, and next steps."
            : active
              ? "Speak naturally. You can pause whenever you need."
              : "Capture a conversation without taking notes. Keep the phone nearby for clearer Hindi."}
        </Text>
        {!active && !processing ? (
          <Text style={[styles.coachTip, { color: colors.faint }]}>
            If several people talk at once, speaker labels may need a quick fix after.
          </Text>
        ) : null}
      </View>
      <View style={styles.visualArea} accessibilityLiveRegion="polite">
        <View style={styles.orbStage}>
          <Animated.View
            style={[
              styles.pulseOuter,
              { borderColor: colors.accentSoft },
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.65] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
              },
            ]}
            pointerEvents="none"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              status === "recording"
                ? "Pause recording"
                : status === "paused"
                  ? "Resume recording"
                  : status === "idle" || status === "error"
                    ? "Begin recording"
                    : undefined
            }
            disabled={starting || processing}
            onPress={() => {
              if (status === "idle" || status === "error") void start();
              else if (active) void togglePause();
            }}
            style={({ pressed }) => [
              styles.recordOrb,
              { backgroundColor: processing ? colors.sageSoft : colors.accentSoft, borderColor: colors.surface },
              pressed && !starting && !processing && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Ionicons
              name={
                processing
                  ? "sparkles"
                  : starting
                    ? "hourglass"
                    : status === "paused"
                      ? "play"
                      : status === "recording"
                        ? "pause"
                        : "mic"
              }
              size={38}
              color={processing ? colors.sage : colors.accent}
            />
          </Pressable>
        </View>
        <Text accessibilityLabel={`Recording time ${time(recorderState.durationMillis)}`} style={[styles.timer, { color: colors.ink }]}>
          {time(recorderState.durationMillis)}
        </Text>
        <Text style={[styles.status, { color: colors.muted }]}> 
          {processing
            ? "Processing securely…"
            : starting
              ? "Starting microphone…"
              : status === "paused"
                ? "Paused"
                : status === "recording"
                  ? "Recording"
                  : "No audio leaves your phone until you finish"}
        </Text>
        <Waveform levels={levels} active={status === "recording"} color={colors.accent} faint={colors.faint} />
        {muffledHint && status === "recording" ? (
          <Text style={[styles.muffledHint, { color: colors.muted }]}>
            Hard to hear — is the phone covered or in a pocket?
          </Text>
        ) : null}
        {distantHint && status === "recording" ? (
          <Text style={[styles.muffledHint, { color: colors.muted }]}>
            Hard to hear — move the phone closer for clearer Hindi.
          </Text>
        ) : null}
      </View>

      {processing ? (
        <View style={[styles.processingCard, { backgroundColor: colors.surface }, !isDark && shadows.card]}>
          {([
            { icon: "checkmark-circle", label: "Recording saved", done: true },
            {
              icon: processingProgress >= 55 ? "checkmark-circle" : "radio-button-on",
              label: processingProgress >= 55
                ? "Transcript ready"
                : processingProgress >= 10
                  ? "Transcribing audio…"
                  : "Understanding the conversation",
              done: processingProgress >= 55,
            },
            {
              icon: processingProgress >= 100 ? "checkmark-circle" : "ellipse-outline",
              label: processingProgress >= 100 ? "Saved on this device" : "Saving privately on this device",
              done: processingProgress >= 100,
            },
          ] as const).map((step, index) => (
            <View key={step.label} style={styles.processingRow}>
              <Ionicons name={step.icon} size={20} color={step.done ? colors.sage : index === 1 ? colors.accent : colors.faint} />
              <Text style={[styles.processingText, { color: step.done ? colors.muted : colors.ink }]}>{step.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {status === "error" && error ? (
        <View style={[styles.errorCard, { backgroundColor: colors.sageSoft }]}>
          <Ionicons name="shield-checkmark-outline" size={23} color={colors.sage} />
          <View style={styles.errorCopy}>
            <Text style={[styles.errorTitle, { color: colors.ink }]}>Your recording is safe</Text>
            <Text style={[styles.errorBody, { color: colors.muted }]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/pending")} style={styles.savedLink}>
              <Text style={[styles.savedLinkText, { color: colors.sage }]}>View saved recording</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.sage} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.controls}>
        {status === "idle" || status === "error" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Begin recording"
            disabled={starting}
            onPress={() => void start()}
            style={({ pressed }) => [
              styles.start,
              { backgroundColor: colors.accent },
              (pressed || starting) && { opacity: 0.8, transform: [{ scale: 0.98 }] },
            ]}
          >
            <View style={[styles.startDot, { backgroundColor: "#FFFFFF" }]} />
            <Text style={styles.startText}>
              {starting ? "Starting…" : status === "error" ? "Record another" : "Start recording"}
            </Text>
          </Pressable>
        ) : active ? (
          <View style={styles.activeControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={status === "paused" ? "Resume recording" : "Pause recording"}
              onPress={() => void togglePause()}
              style={({ pressed }) => [styles.controlButton, { backgroundColor: colors.surface }, pressed && { opacity: 0.65 }]}
            >
              <Ionicons name={status === "paused" ? "play" : "pause"} size={23} color={colors.ink} />
              <Text style={[styles.controlText, { color: colors.ink }]}>{status === "paused" ? "Resume" : "Pause"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop and process recording"
              onPress={() => void stop()}
              style={({ pressed }) => [styles.stopButton, { backgroundColor: colors.accent }, pressed && { opacity: 0.78, transform: [{ scale: 0.98 }] }]}
            >
              <View style={styles.stopIcon} />
              <Text style={styles.stopText}>Finish</Text>
            </Pressable>
          </View>
        ) : null}
        {!processing ? (
          <View style={styles.reassurance}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.sage} />
            <Text style={[styles.reassuranceText, { color: colors.muted }]}>Private by default · Delete anytime</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  topCopy: { alignItems: "center", paddingTop: spacing.xxl },
  title: { fontSize: typeScale.title1, lineHeight: 40, fontWeight: "800", letterSpacing: -1, textAlign: "center", marginTop: spacing.lg },
  subtitle: { maxWidth: 320, fontSize: typeScale.body, lineHeight: 22, textAlign: "center", marginTop: spacing.xs },
  coachTip: { maxWidth: 300, fontSize: typeScale.caption, lineHeight: 18, textAlign: "center", marginTop: spacing.sm },
  visualArea: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center" },
  orbStage: { width: 160, height: 160, alignItems: "center", justifyContent: "center" },
  pulseOuter: { position: "absolute", width: 132, height: 132, borderRadius: 66, borderWidth: 22 },
  recordOrb: { width: 112, height: 112, borderRadius: 56, borderWidth: 10, alignItems: "center", justifyContent: "center", ...shadows.floating },
  timer: { fontSize: 44, fontWeight: "400", letterSpacing: -1.2, fontVariant: ["tabular-nums"], marginTop: spacing.lg },
  status: { fontSize: 13, marginTop: spacing.xs },
  waveform: { width: "100%", height: 70, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, marginTop: spacing.xl },
  waveBar: { width: 4, borderRadius: 3 },
  muffledHint: {
    maxWidth: 280,
    fontSize: typeScale.caption,
    lineHeight: 18,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  processingCard: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.lg },
  processingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  processingText: { fontSize: 14, fontWeight: "600" },
  errorCard: { flexDirection: "row", gap: spacing.sm, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  errorCopy: { flex: 1 },
  errorTitle: { fontSize: 15, fontWeight: "800" },
  errorBody: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  savedLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  savedLinkText: { fontSize: 13, fontWeight: "800" },
  controls: { marginTop: "auto" },
  start: { height: 60, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  startDot: { width: 14, height: 14, borderRadius: 7 },
  startText: { color: "#FFFFFF", fontSize: typeScale.bodyLarge, fontWeight: "800" },
  activeControls: { flexDirection: "row", gap: spacing.sm },
  controlButton: { flex: 0.75, height: 60, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  controlText: { fontSize: typeScale.body, fontWeight: "700" },
  stopButton: { flex: 1.25, height: 60, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  stopIcon: { width: 13, height: 13, borderRadius: 3, backgroundColor: "#FFFFFF" },
  stopText: { color: "#FFFFFF", fontSize: typeScale.bodyLarge, fontWeight: "800" },
  reassurance: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  reassuranceText: { fontSize: typeScale.caption },
});
