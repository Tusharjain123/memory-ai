import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { radii, spacing, useAppTheme } from "../theme";

/** Horizontal pill selector; the selected pill is solid ink. */
export function SegmentedChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              selected
                ? { backgroundColor: colors.ink, borderColor: colors.ink }
                : { backgroundColor: colors.surface, borderColor: colors.line },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.label, { color: selected ? colors.background : colors.muted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: 2 },
  chip: { minHeight: 36, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "800" },
});
