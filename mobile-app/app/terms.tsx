import { ScrollView, StyleSheet, Text, View } from "react-native";
import { radii, spacing, typeScale, useAppTheme } from "../src/theme";

const SECTIONS = [
  ["Using Memory AI", "Memory AI helps you record, process, organize, and search conversations you choose to capture. You are responsible for using recording features lawfully and obtaining consent when required."],
  ["Your information", "Profile details are optional and stored in the app’s local database. Conversation results return to your device after processing. You can remove individual memories or clear local data from Privacy & Security."],
  ["AI-generated content", "Transcripts, summaries, action items, decisions, and answers may contain mistakes. Review important information before relying on it for professional, legal, medical, or financial decisions."],
  ["Responsible use", "Do not use Memory AI to record people unlawfully, violate privacy, infringe intellectual property, distribute harmful content, or interfere with the service."],
  ["Availability", "Processing depends on configured transcription and AI services. Features may be temporarily unavailable, and unfinished recordings should be retained locally until processing can continue."],
];

export default function TermsScreen() {
  const { colors } = useAppTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Terms of use</Text>
      <Text style={[styles.updated, { color: colors.muted }]}>Last updated 3 August 2026</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {SECTIONS.map(([title, body], index) => (
          <View key={title} style={[styles.section, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
            <Text style={[styles.heading, { color: colors.ink }]}>{title}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.note, { color: colors.faint }]}>These in-app terms describe the current local application experience and should be reviewed by legal counsel before public release.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1 },
  updated: { fontSize: 12, marginTop: spacing.xs, marginBottom: spacing.xl },
  card: { borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md },
  section: { paddingVertical: spacing.lg },
  heading: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  body: { fontSize: 14, lineHeight: 22, marginTop: spacing.xs },
  note: { fontSize: 11, lineHeight: 17, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
});
