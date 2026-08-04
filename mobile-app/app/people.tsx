import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { listPeople, type PersonMemory } from "../src/db/insights";
import { relativeDate } from "../src/utils/format";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

function relationship(count: number): string {
  if (count >= 5) return "Frequent collaborator";
  if (count >= 2) return "Growing context";
  return "New connection";
}

export default function PeopleScreen() {
  const { colors, isDark } = useAppTheme();
  const [people, setPeople] = useState<PersonMemory[]>([]);
  useFocusEffect(useCallback(() => { void listPeople().then(setPeople); }, []));

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, !people.length && styles.emptyList]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>People you remember</Text>
            <Text style={[styles.intro, { color: colors.muted }]}>A quiet relationship history, built from your conversations.</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyVisual} accessibilityLabel="No remembered people yet">
            <Image source={require("../assets/empty-people.png")} resizeMode="contain" style={styles.emptyImage} />
          </View>
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface },
              !isDark && shadows.card,
              index > 0 && { marginTop: spacing.sm },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: index % 2 ? colors.accentSoft : colors.sageSoft }]}>
              <Text style={[styles.initial, { color: index % 2 ? colors.accent : colors.sage }]}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.details}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.ink }]}>{item.name}</Text>
                <View style={[styles.relationship, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.relationshipText, { color: colors.muted }]}>{relationship(item.conversationCount)}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="chatbubbles-outline" size={15} color={colors.faint} />
                <Text style={[styles.meta, { color: colors.muted }]}>{item.conversationCount} {item.conversationCount === 1 ? "conversation" : "conversations"}</Text>
                <Text style={[styles.dot, { color: colors.faint }]}>·</Text>
                <Text style={[styles.meta, { color: colors.muted }]}>{relativeDate(item.lastInteractionAt)}</Text>
              </View>
              {item.topics.length ? (
                <View style={styles.topics}>
                  {item.topics.slice(0, 3).map((topic) => (
                    <View key={topic} style={[styles.topic, { backgroundColor: colors.sageSoft }]}>
                      <Text style={[styles.topicText, { color: colors.sage }]}>{topic}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  emptyList: { flexGrow: 1 },
  header: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1 },
  intro: { fontSize: typeScale.body, lineHeight: 22, marginTop: spacing.xs, marginBottom: spacing.md },
  emptyVisual: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: spacing.xl },
  emptyImage: { width: 300, height: 300, borderRadius: radii.xl },
  card: { borderRadius: radii.lg, padding: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  avatar: { width: 54, height: 54, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: typeScale.title3, fontWeight: "800" },
  details: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  name: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  relationship: { minHeight: 25, borderRadius: radii.pill, justifyContent: "center", paddingHorizontal: 8 },
  relationshipText: { fontSize: 10, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: spacing.xs },
  meta: { fontSize: typeScale.caption },
  dot: { fontSize: typeScale.caption },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  topic: { minHeight: 28, borderRadius: radii.pill, justifyContent: "center", paddingHorizontal: 9 },
  topicText: { fontSize: 11, fontWeight: "700" },
});
