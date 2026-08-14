import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listPeople, type PersonMemory } from "../src/db/insights";
import { relativeDate } from "../src/utils/format";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

export default function PeopleScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [people, setPeople] = useState<PersonMemory[]>([]);

  useFocusEffect(useCallback(() => {
    void listPeople().then(setPeople);
  }, []));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, !people.length && styles.emptyContent]}
      showsVerticalScrollIndicator={false}
    >
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
        People
      </Text>
      <Text style={[styles.intro, { color: colors.muted }]}>
        Relationship memory across conversations — promises, preferences, and what to follow up.
      </Text>

      {!people.length ? (
        <View style={styles.emptyVisual} accessibilityLabel="No remembered people yet">
          <Image
            source={isDark
              ? require("../assets/empty-people-dark.png")
              : require("../assets/empty-people.png")}
            resizeMode="contain"
            style={styles.emptyImage}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {people.map((person, index) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${person.name}`}
              onPress={() => router.push(`/person/${person.id}`)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.surface },
                !isDark && shadows.card,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: index % 2 ? colors.accentSoft : colors.sageSoft }]}>
                <Text style={[styles.initial, { color: index % 2 ? colors.accent : colors.sage }]}>
                  {person.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.copy}>
                <Text style={[styles.name, { color: colors.ink }]}>{person.name}</Text>
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {person.conversationCount} conversation{person.conversationCount === 1 ? "" : "s"}
                  {" · "}
                  {relativeDate(person.lastInteractionAt)}
                </Text>
                {person.topics.slice(0, 3).length ? (
                  <Text numberOfLines={1} style={[styles.topics, { color: colors.faint }]}>
                    {person.topics.slice(0, 3).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48 },
  emptyContent: { flexGrow: 1 },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1 },
  intro: { fontSize: typeScale.body, lineHeight: 22, marginTop: spacing.xs, marginBottom: spacing.lg },
  list: { gap: spacing.sm },
  row: {
    minHeight: 84,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  copy: { flex: 1 },
  name: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  meta: { fontSize: typeScale.caption, marginTop: 3, fontWeight: "600" },
  topics: { fontSize: 12, marginTop: 4 },
  emptyVisual: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: spacing.xl },
  emptyImage: { width: 300, height: 300, borderRadius: radii.xl },
});
