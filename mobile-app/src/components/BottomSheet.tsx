import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, shadows, spacing, useAppTheme } from "../theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_DISTANCE = 110;

/**
 * Drawer that slides up from the bottom. Drag the handle (or the header) down,
 * tap the backdrop, or press back to close. No native gesture library needed.
 */
export function BottomSheet({
  visible,
  onClose,
  header,
  children,
  maxHeightRatio = 0.72,
}: {
  visible: boolean;
  onClose: () => void;
  /** Draggable area above the scrollable content. */
  header?: ReactNode;
  children: ReactNode;
  maxHeightRatio?: number;
}) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  // Keep the Modal mounted while the close animation runs.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > 1.1) {
          onCloseRef.current();
        } else {
          Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 240, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            maxHeight: SCREEN_HEIGHT * maxHeightRatio,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            transform: [{ translateY }],
          },
          !isDark && shadows.floating,
        ]}
      >
        <View {...pan.panHandlers} style={styles.dragArea}>
          <View style={[styles.handle, { backgroundColor: colors.line }]} />
          {header}
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(4, 12, 24, 0.45)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  dragArea: { paddingTop: spacing.xs, paddingHorizontal: spacing.lg },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, marginBottom: spacing.sm },
});
