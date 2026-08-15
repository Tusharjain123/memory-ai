import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { submitFeedback, type FeedbackCategory } from "../src/services/feedback";
import { radii, spacing, typeScale, useAppTheme } from "../src/theme";

const CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "experience", label: "Experience" },
  { value: "transcription", label: "Transcription" },
  { value: "bug", label: "Bug" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Other" },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [category, setCategory] = useState<FeedbackCategory>("experience");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const valid = message.trim().length >= 10 && !sending;

  async function send(): Promise<void> {
    if (!valid) return;
    setSending(true);
    try {
      await submitFeedback({
        category,
        message: message.trim(),
        rating,
        email: email.trim() || null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Thank you", "Your feedback was sent. It will help shape the next version.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (cause) {
      Alert.alert("Feedback wasn’t sent", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.accent} />
        </View>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>Help improve Memory</Text>
        <Text style={[styles.intro, { color: colors.muted }]}>Tell us what worked, what felt confusing, or what you need next. Please don’t include private conversation content.</Text>

        <Text style={[styles.label, { color: colors.ink }]}>What is this about?</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((item) => {
            const selected = item.value === category;
            return <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setCategory(item.value)} style={[styles.chip, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line }]}>
              <Text style={[styles.chipText, { color: selected ? colors.accent : colors.ink }]}>{item.label}</Text>
            </Pressable>;
          })}
        </View>

        <Text style={[styles.label, { color: colors.ink }]}>How was your experience? <Text style={{ color: colors.faint }}>(optional)</Text></Text>
        <View style={styles.rating}>
          {[1, 2, 3, 4, 5].map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} out of 5`} accessibilityState={{ selected: rating === value }} onPress={() => setRating(rating === value ? null : value)} hitSlop={5}>
            <Ionicons name={rating != null && value <= rating ? "star" : "star-outline"} size={32} color={rating != null && value <= rating ? colors.accent : colors.faint} />
          </Pressable>)}
        </View>

        <Text style={[styles.label, { color: colors.ink }]}>Your feedback</Text>
        <TextInput accessibilityLabel="Feedback message" value={message} onChangeText={setMessage} placeholder="What happened, and what would have made it better?" placeholderTextColor={colors.faint} multiline maxLength={4000} textAlignVertical="top" style={[styles.message, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]} />
        <Text style={[styles.counter, { color: colors.faint }]}>{message.length}/4000</Text>

        <Text style={[styles.label, { color: colors.ink }]}>Email <Text style={{ color: colors.faint }}>(optional)</Text></Text>
        <TextInput accessibilityLabel="Feedback contact email" value={email} onChangeText={setEmail} placeholder="Only if you want a reply" placeholderTextColor={colors.faint} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={320} style={[styles.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]} />

        <Pressable accessibilityRole="button" disabled={!valid} onPress={() => void send()} style={[styles.submit, { backgroundColor: valid ? colors.accent : colors.surfaceMuted }]}>
          <Text style={[styles.submitText, { color: valid ? "#FFFFFF" : colors.faint }]}>{sending ? "Sending…" : "Send feedback"}</Text>
        </Pressable>
        <Text style={[styles.privacy, { color: colors.faint }]}>Feedback, app version and device platform are sent to Memory AI. Your recordings and transcripts are not attached.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  icon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -0.8, marginTop: spacing.md },
  intro: { fontSize: typeScale.body, lineHeight: 22, marginTop: spacing.xs, marginBottom: spacing.xl },
  label: { fontSize: 14, fontWeight: "800", marginTop: spacing.md, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { minHeight: 42, borderWidth: 1, borderRadius: radii.pill, justifyContent: "center", paddingHorizontal: spacing.md },
  chipText: { fontSize: 13, fontWeight: "700" },
  rating: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  message: { minHeight: 150, borderWidth: 1, borderRadius: radii.md, padding: spacing.md, fontSize: typeScale.body, lineHeight: 22 },
  counter: { fontSize: 11, textAlign: "right", marginTop: 4 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typeScale.body },
  submit: { minHeight: 56, borderRadius: radii.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  submitText: { fontSize: 16, fontWeight: "800" },
  privacy: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
});
