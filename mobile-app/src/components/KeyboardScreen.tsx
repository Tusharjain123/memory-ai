import type { PropsWithChildren } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { spacing } from "../theme";

type KeyboardScreenProps = PropsWithChildren<{
  backgroundColor: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
}>;

export function KeyboardScreen({
  backgroundColor,
  contentContainerStyle,
  bottomOffset = 72,
  children,
}: KeyboardScreenProps) {
  return (
    <View style={[styles.page, { backgroundColor }]}>
      <KeyboardAwareScrollView
        bottomOffset={bottomOffset}
        extraKeyboardSpace={spacing.md}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
