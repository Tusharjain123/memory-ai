import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ClipPlayerState } from "../hooks/useClipPlayer";
import { useClipPlayer } from "../hooks/useClipPlayer";
import { formatTimestamp } from "../utils/format";
import { radii, spacing, typeScale, useAppTheme } from "../theme";

export function RecordingPlayer({
  recordingUri,
  player: sharedPlayer,
  fallbackDurationMs,
  autoPlay = false,
}: {
  recordingUri?: string | null;
  player?: ClipPlayerState;
  fallbackDurationMs?: number | null;
  autoPlay?: boolean;
}) {
  const owned = useClipPlayer(sharedPlayer ? null : recordingUri);
  const player = sharedPlayer ?? owned;
  const { colors } = useAppTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const autoPlayed = useRef(false);

  useEffect(() => {
    if (!autoPlay || !player.available || autoPlayed.current) return;
    autoPlayed.current = true;
    void player.playFull();
  }, [autoPlay, player.available, player.playFull]);

  if (!player.available) return null;

  const durationMs = player.durationMs > 0 ? player.durationMs : (fallbackDurationMs ?? 0);
  const progress = durationMs > 0 ? Math.min(1, player.currentTimeMs / durationMs) : 0;
  const isPlaying = player.playing && player.mode !== "clip";

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.line }]}
      accessibilityLabel="Original recording player"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause recording" : "Play recording"}
        onPress={() => void player.togglePlay()}
        style={({ pressed }) => [
          styles.play,
          { backgroundColor: colors.accentSoft },
          pressed && { opacity: 0.72 },
        ]}
      >
        <Ionicons name={isPlaying ? "pause" : "play"} size={18} color={colors.accent} />
      </Pressable>
      <View style={styles.body}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Seek in recording"
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            if (durationMs <= 0 || trackWidth <= 0) return;
            const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth));
            void player.seekTo(ratio * durationMs);
            if (!isPlaying) void player.playFull();
          }}
          style={[styles.track, { backgroundColor: colors.line }]}
        >
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
        </Pressable>
        <View style={styles.times}>
          <Text style={[styles.time, { color: colors.muted }]}>
            {formatTimestamp(player.currentTimeMs)}
          </Text>
          <Text style={[styles.time, { color: colors.muted }]}>
            {formatTimestamp(durationMs)}
          </Text>
        </View>
        {player.error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{player.error}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 6 },
  track: {
    height: 8,
    borderRadius: radii.pill,
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: {
    height: 8,
    borderRadius: radii.pill,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: {
    fontSize: typeScale.caption,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  error: {
    fontSize: typeScale.caption,
  },
});
