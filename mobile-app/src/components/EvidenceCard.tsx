import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConfidenceLevel } from "../contracts";
import { formatTimestamp } from "../utils/format";
import { radii, spacing, typeScale, useAppTheme } from "../theme";

export type EvidenceProps = {
  quote: string | null;
  speakerLabel: string | null;
  speakerName?: string | null;
  startMs: number | null;
  confidence?: ConfidenceLevel | null;
  playing?: boolean;
  available?: boolean;
  onPlay?: () => void;
};

export function EvidenceCard({
  quote,
  speakerLabel,
  speakerName,
  startMs,
  confidence,
  playing = false,
  available = true,
  onPlay,
}: EvidenceProps) {
  const { colors } = useAppTheme();
  if (!quote && startMs == null) return null;
  const speaker = speakerName || speakerLabel || "Speaker";
  const time = startMs != null ? formatTimestamp(startMs) : null;
  const canPlay = Boolean(onPlay) && available && startMs != null;

  return (
    <Pressable
      accessibilityRole={canPlay ? "button" : undefined}
      accessibilityLabel={
        canPlay
          ? `Play evidence from ${speaker} at ${time}: ${quote ?? ""}`
          : `Evidence from ${speaker}${time ? ` at ${time}` : ""}`
      }
      disabled={!canPlay}
      onPress={canPlay ? onPlay : undefined}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
        pressed && canPlay && { opacity: 0.72 },
      ]}
    >
      <View style={styles.meta}>
        <Text style={[styles.speaker, { color: colors.ink }]}>
          {speaker}
          {time ? ` · ${time}` : ""}
        </Text>
        <View style={styles.metaRight}>
          {confidence ? (
            <View style={[styles.confidence, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.confidenceText, { color: colors.accent }]}>{confidence}</Text>
            </View>
          ) : null}
          {canPlay ? (
            <Ionicons
              name={playing ? "pause-circle" : "play-circle"}
              size={22}
              color={colors.accent}
            />
          ) : null}
        </View>
      </View>
      {quote ? (
        <Text style={[styles.quote, { color: colors.muted }]}>“{quote}”</Text>
      ) : null}
      {!available && startMs != null ? (
        <Text style={[styles.missing, { color: colors.faint }]}>Audio unavailable</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 6,
    marginTop: spacing.xs,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  speaker: {
    flex: 1,
    fontSize: typeScale.caption,
    fontWeight: "700",
  },
  confidence: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  quote: {
    fontSize: typeScale.body,
    lineHeight: 21,
    fontStyle: "italic",
  },
  missing: {
    fontSize: typeScale.caption,
  },
});
