import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme";

export function personInitials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Stable soft tints so the same person keeps the same colour.
const TINTS = ["#DDF7F2", "#E3E9FF", "#FFE8D9", "#F3E3FF", "#FFF3C9", "#DFF1FF"];
const INKS = ["#0B8E7D", "#3A4FB8", "#C2581B", "#7B3FB0", "#9A7400", "#1F6FB2"];

export function avatarColors(seed: string): { background: string; ink: string } {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const index = Math.abs(hash) % TINTS.length;
  return { background: TINTS[index]!, ink: INKS[index]! };
}

/** Overlapping initials, "+N" when there are more. */
export function AvatarStack({ names, max = 3, size = 26 }: { names: string[]; max?: number; size?: number }) {
  const { colors } = useAppTheme();
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <View style={styles.row} accessibilityLabel={`${names.length} people`}>
      {shown.map((name, index) => {
        const tint = avatarColors(name);
        return (
          <View
            key={`${name}-${index}`}
            style={[
              styles.avatar,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.background, borderColor: colors.surface },
              index > 0 && { marginLeft: -size * 0.32 },
            ]}
          >
            <Text style={[styles.text, { color: tint.ink, fontSize: size * 0.38 }]}>{personInitials(name)}</Text>
          </View>
        );
      })}
      {extra > 0 ? (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.ink, borderColor: colors.surface, marginLeft: -size * 0.32 }]}>
          <Text style={[styles.text, { color: colors.background, fontSize: size * 0.36 }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  avatar: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  text: { fontWeight: "800" },
});
