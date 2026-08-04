import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

const FEATURES = [
  { icon: "mic-outline" as const, title: "Capture naturally", body: "Record a meeting, conversation, or spoken idea without splitting your attention." },
  { icon: "sparkles-outline" as const, title: "Find the meaning", body: "Turn audio into a transcript, summary, people, decisions, topics, and action items." },
  { icon: "search-outline" as const, title: "Remember later", body: "Search across saved memories and ask questions grounded in your conversations." },
];

export default function AboutScreen() {
  const { colors, isDark } = useAppTheme();
  const version = Constants.expoConfig?.version ?? "0.1.0";
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Image
          accessibilityLabel="Memory AI logo"
          source={require("../assets/memory-ai-logo.png")}
          resizeMode="cover"
          style={[styles.mark, { borderColor: colors.line }]}
        />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Memory AI</Text>
        <Text style={[styles.tagline, { color: colors.muted }]}>A private second brain for the conversations that matter.</Text>
        <Text style={[styles.version, { color: colors.faint }]}>Version {version}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card]}>
        {FEATURES.map((feature, index) => (
          <View key={feature.title} style={[styles.feature, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}><Ionicons name={feature.icon} size={21} color={colors.accent} /></View>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { color: colors.ink }]}>{feature.title}</Text>
              <Text style={[styles.featureBody, { color: colors.muted }]}>{feature.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.ink }]}>How your information is handled</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.infoBody, { color: colors.muted }]}>Memories and optional profile details are stored in the app’s local database. Audio is sent to the configured backend only when you finish recording so transcription and AI processing can run. The resulting memory returns to your device.</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.ink }]}>A note about AI</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.infoBody, { color: colors.muted }]}>AI-generated transcripts, summaries, answers, and action items can be incomplete or incorrect. Review important details before relying on them.</Text>
      </View>

      <Text style={[styles.footer, { color: colors.faint }]}>Designed for clarity, control, and better recall.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  hero: { alignItems: "center", paddingVertical: spacing.xl },
  mark: { width: 92, height: 92, borderRadius: 28, borderWidth: 1 },
  title: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1, marginTop: spacing.md },
  tagline: { maxWidth: 330, fontSize: typeScale.body, lineHeight: 22, textAlign: "center", marginTop: spacing.xs },
  version: { fontSize: 11, marginTop: spacing.sm },
  card: { borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md },
  feature: { minHeight: 100, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  featureCopy: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: "800" },
  featureBody: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  sectionTitle: { fontSize: typeScale.title3, fontWeight: "800", letterSpacing: -0.4, marginTop: spacing.xl, marginBottom: spacing.sm },
  infoCard: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md },
  infoBody: { fontSize: 14, lineHeight: 22 },
  footer: { fontSize: 11, textAlign: "center", marginTop: spacing.xl },
});
