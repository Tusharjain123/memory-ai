import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  getPersonPrepBrief,
  type PersonPrepBrief,
} from "../../../src/db/personMemories";
import { InlineState, SoftCard } from "../../../src/components/ui";
import { relativeDate } from "../../../src/utils/format";
import { radii, spacing, typeScale, useAppTheme } from "../../../src/theme";

export default function PersonPrepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [brief, setBrief] = useState<PersonPrepBrief | null>();

  useFocusEffect(useCallback(() => {
    if (!id) return;
    void getPersonPrepBrief(id).then(setBrief);
  }, [id]));

  if (brief === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="sparkles" title="Preparing brief…" loading />
      </View>
    );
  }
  if (!brief) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <InlineState icon="person-outline" title="Person not found" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
        Before meeting {brief.personName}
      </Text>
      <Text style={[styles.subheading, { color: colors.muted }]}>
        Assembled from approved memory on this device.
      </Text>

      {brief.lastConversation ? (
        <SoftCard>
          <Text style={[styles.label, { color: colors.faint }]}>LAST CONVERSATION</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{brief.lastConversation.title}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {relativeDate(brief.lastConversation.createdAt)}
          </Text>
          <Text style={[styles.body, { color: colors.ink }]}>{brief.lastConversation.summary}</Text>
        </SoftCard>
      ) : null}

      <SoftCard>
        <Text style={[styles.label, { color: colors.faint }]}>OPEN PROMISES</Text>
        {brief.openPromises.length ? brief.openPromises.map((item) => (
          <Text key={`${item.direction}:${item.text}`} style={[styles.body, { color: colors.ink }]}>
            {item.direction === "i_owe" ? "You promised: " : item.direction === "they_owe" ? `${brief.personName} promised: ` : ""}
            {item.text}
            {item.dueAt ? ` (due ${item.dueAt})` : ""}
          </Text>
        )) : (
          <Text style={[styles.body, { color: colors.muted }]}>No open promises.</Text>
        )}
      </SoftCard>

      <SoftCard>
        <Text style={[styles.label, { color: colors.faint }]}>PREFERENCES & FACTS</Text>
        {brief.facts.length ? brief.facts.map((item) => (
          <Text key={item.text} style={[styles.body, { color: colors.ink }]}>
            {item.text}
            <Text style={{ color: colors.faint }}>
              {" "}({item.memoryClass === "user_confirmed" ? "confirmed" : "inferred"})
            </Text>
          </Text>
        )) : (
          <Text style={[styles.body, { color: colors.muted }]}>No approved facts yet.</Text>
        )}
      </SoftCard>

      <SoftCard>
        <Text style={[styles.label, { color: colors.faint }]}>FOLLOW UP</Text>
        {brief.followUps.length ? brief.followUps.map((item) => (
          <Text key={item} style={[styles.body, { color: colors.ink }]}>{item}</Text>
        )) : (
          <Text style={[styles.body, { color: colors.muted }]}>Nothing flagged to follow up.</Text>
        )}
      </SoftCard>

      {brief.topics.length ? (
        <SoftCard>
          <Text style={[styles.label, { color: colors.faint }]}>FREQUENT TOPICS</Text>
          <Text style={[styles.body, { color: colors.ink }]}>{brief.topics.join(" · ")}</Text>
        </SoftCard>
      ) : null}

      {brief.decisions.length ? (
        <SoftCard>
          <Text style={[styles.label, { color: colors.faint }]}>DECISIONS INVOLVING THEM</Text>
          {brief.decisions.slice(0, 6).map((item) => (
            <Text key={item} style={[styles.body, { color: colors.ink }]}>{item}</Text>
          ))}
        </SoftCard>
      ) : null}

      <Pressable
        onPress={() => router.push("/record")}
        style={[styles.cta, { backgroundColor: colors.accent }]}
      >
        <Text style={styles.ctaText}>Start recording</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  heading: { fontSize: typeScale.title2, fontWeight: "800", letterSpacing: -0.4 },
  subheading: { fontSize: typeScale.body, lineHeight: 22, marginBottom: spacing.xs },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: spacing.xs },
  title: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  meta: { fontSize: 12, marginTop: 2, marginBottom: spacing.sm },
  body: { fontSize: typeScale.body, lineHeight: 23, marginBottom: 6 },
  cta: {
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
