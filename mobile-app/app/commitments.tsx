import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  listCommitments,
  setCommitmentStatus,
  type CommitmentFilter,
  type CommitmentRecord,
} from "../src/db/commitments";
import { PlayableEvidence } from "../src/components/PlayableEvidence";
import { InlineState, SegmentedControl, SoftCard } from "../src/components/ui";
import { relativeDate } from "../src/utils/format";
import { radii, spacing, typeScale, useAppTheme } from "../src/theme";

function directionLabel(direction: string): string {
  if (direction === "i_owe") return "You promised";
  if (direction === "they_owe") return "They promised";
  if (direction === "mutual") return "Mutual promise";
  return "Commitment";
}

export default function CommitmentsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<CommitmentFilter>("open");
  const [items, setItems] = useState<CommitmentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setItems(await listCommitments(filter));
    setLoaded(true);
  }, [filter]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function complete(item: CommitmentRecord): Promise<void> {
    await setCommitmentStatus(
      item.id,
      item.status === "completed" ? "proposed" : "completed",
    );
    await load();
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
        Commitment ledger
      </Text>
      <Text style={[styles.subheading, { color: colors.muted }]}>
        Who promised what — across every conversation on this device.
      </Text>

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Open" },
          { value: "mine", label: "Mine" },
          { value: "theirs", label: "Theirs" },
          { value: "completed", label: "Done" },
        ]}
      />

      {!loaded ? (
        <InlineState icon="sparkles" title="Loading commitments…" loading />
      ) : items.length === 0 ? (
        <InlineState
          icon="checkmark-done-outline"
          title="Nothing here yet"
          body="Promises extracted from conversations will appear in this ledger."
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <SoftCard key={item.id}>
              <Pressable onPress={() => router.push(`/conversation/${item.conversationId}`)}>
                <Text style={[styles.meta, { color: colors.faint }]}>
                  {relativeDate(item.createdAt)} · {item.conversationTitle}
                </Text>
                <Text style={[styles.direction, { color: colors.accent }]}>
                  {directionLabel(item.direction)}
                </Text>
                <Text style={[styles.text, { color: colors.ink }]}>{item.text}</Text>
                {(item.ownerName || item.dueAt) ? (
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {[item.ownerName, item.dueAt].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </Pressable>
              <PlayableEvidence
                recordingUri={item.recordingUri}
                quote={item.quote}
                speakerLabel={item.speakerLabel}
                startMs={item.startMs}
                confidence={item.confidence}
              />
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void complete(item)}
                  style={[styles.actionBtn, { backgroundColor: colors.sageSoft }]}
                >
                  <Ionicons
                    name={item.status === "completed" ? "refresh-outline" : "checkmark-circle-outline"}
                    size={18}
                    color={colors.sage}
                  />
                  <Text style={[styles.actionText, { color: colors.sage }]}>
                    {item.status === "completed" ? "Reopen" : "Mark done"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/conversation/${item.conversationId}`)}
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={[styles.actionText, { color: colors.ink }]}>Open memory</Text>
                </Pressable>
              </View>
            </SoftCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  heading: { fontSize: typeScale.title2, fontWeight: "800", letterSpacing: -0.4 },
  subheading: { fontSize: typeScale.body, lineHeight: 22, marginBottom: spacing.sm },
  list: { gap: spacing.md, marginTop: spacing.sm },
  meta: { fontSize: typeScale.caption, fontWeight: "600" },
  direction: { fontSize: 12, fontWeight: "800", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  text: { fontSize: typeScale.bodyLarge, fontWeight: "700", lineHeight: 24, marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  actionBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: { fontSize: 13, fontWeight: "700" },
});
