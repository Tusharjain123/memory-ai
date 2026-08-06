import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Image, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  listPeopleByConversation,
  type ConversationPerson,
  type PeopleConversationSection,
} from "../src/db/people";
import { formatDuration, relativeDate } from "../src/utils/format";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

type DirectorySection = PeopleConversationSection & {
  data: ConversationPerson[];
};

export default function PeopleScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [sections, setSections] = useState<DirectorySection[]>([]);
  useFocusEffect(useCallback(() => {
    void listPeopleByConversation().then((items) =>
      setSections(items.map((item) => ({ ...item, data: item.people })))
    );
  }, []));

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.conversationId}:${item.speakerLabel}`}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.list, !sections.length && styles.emptyList]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>People by recording</Text>
            <Text style={[styles.intro, { color: colors.muted }]}>Identify each speaker and keep the context you want to remember.</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyVisual} accessibilityLabel="No remembered people yet">
            <Image
              source={isDark
                ? require("../assets/empty-people-dark.png")
                : require("../assets/empty-people.png")}
              resizeMode="contain"
              style={styles.emptyImage}
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open recording ${section.title}`}
            onPress={() => router.push(`/conversation/${section.conversationId}`)}
            style={({ pressed }) => [styles.recordingHeader, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.recordingDate, { color: colors.muted }]}>{relativeDate(section.createdAt)}</Text>
            <View style={styles.recordingTitleRow}>
              <Text numberOfLines={1} style={[styles.recordingTitle, { color: colors.ink }]}>{section.title}</Text>
              <Text style={[styles.recordingTime, { color: colors.faint }]}>{formatDuration(section.durationMs)}</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.faint} />
            </View>
          </Pressable>
        )}
        renderItem={({ item, index, section }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}, ${item.speakerLabel}`}
            onPress={() => router.push({
              pathname: "/person/[id]",
              params: {
                id: item.personId,
                conversationId: item.conversationId,
                speakerLabel: item.speakerLabel,
              },
            } as never)}
            style={({ pressed }) => [
              styles.personRow,
              { backgroundColor: colors.surface },
              !isDark && shadows.card,
              index === 0 && styles.firstPerson,
              index === section.data.length - 1 && styles.lastPerson,
              pressed && { opacity: 0.62 },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: index % 2 ? colors.accentSoft : colors.sageSoft }]}>
              <Text style={[styles.initial, { color: index % 2 ? colors.accent : colors.sage }]}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.details}>
              <Text style={[styles.name, { color: colors.ink }]}>{item.name}</Text>
              <View style={styles.personMeta}>
                <Text style={[styles.speakerLabel, { color: colors.muted }]}>{item.speakerLabel}</Text>
                {item.relationship ? (
                  <>
                    <Text style={[styles.dot, { color: colors.faint }]}>·</Text>
                    <Text numberOfLines={1} style={[styles.relationshipText, { color: colors.muted }]}>{item.relationship}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <Ionicons name="create-outline" size={19} color={colors.accent} />
          </Pressable>
        )}
        SectionSeparatorComponent={() => <View style={{ height: spacing.xl }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  emptyList: { flexGrow: 1 },
  header: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  heading: { fontSize: typeScale.title1, fontWeight: "800", letterSpacing: -1 },
  intro: { fontSize: typeScale.body, lineHeight: 22, marginTop: spacing.xs, marginBottom: spacing.md },
  emptyVisual: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: spacing.xl },
  emptyImage: { width: 300, height: 300, borderRadius: radii.xl },
  recordingHeader: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  recordingDate: { fontSize: 11, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  recordingTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 3 },
  recordingTitle: { flex: 1, fontSize: typeScale.bodyLarge, fontWeight: "800" },
  recordingTime: { fontSize: typeScale.caption, fontVariant: ["tabular-nums"] },
  personRow: { minHeight: 76, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  firstPerson: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  lastPerson: { borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  details: { flex: 1 },
  name: { fontSize: typeScale.bodyLarge, fontWeight: "800" },
  personMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  speakerLabel: { fontSize: typeScale.caption, fontWeight: "600" },
  relationshipText: { flexShrink: 1, fontSize: typeScale.caption },
  dot: { fontSize: typeScale.caption },
});
