import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAppTheme } from "../src/theme";
import { AppLock } from "../src/components/AppLock";
import { useThemeStore } from "../src/store/useThemeStore";
import { bindProcessingAppState } from "../src/services/processingOrchestrator";

export default function RootLayout() {
  const { colors, isDark } = useAppTheme();
  const hydrateTheme = useThemeStore((state) => state.hydrate);

  useEffect(() => {
    void hydrateTheme();
  }, [hydrateTheme]);

  useEffect(() => bindProcessingAppState(), []);

  return (
    <SafeAreaProvider>
      <KeyboardProvider
        statusBarTranslucent
        navigationBarTranslucent
        preserveEdgeToEdge
      >
        <AppLock>
          <StatusBar style={isDark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
              headerTintColor: colors.ink,
              headerTitleStyle: { fontWeight: "700" },
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="record" options={{ title: "New memory", presentation: "modal", gestureEnabled: false }} />
            <Stack.Screen name="conversation/[id]" options={{ title: "Memory" }} />
            <Stack.Screen name="review/[id]" options={{ title: "Review memory" }} />
            <Stack.Screen name="commitments" options={{ title: "Commitments" }} />
            <Stack.Screen name="search" options={{ title: "Ask Memory" }} />
            <Stack.Screen name="settings" options={{ title: "Privacy" }} />
            <Stack.Screen name="people" options={{ title: "People" }} />
            <Stack.Screen name="person/[id]" options={{ title: "Person" }} />
            <Stack.Screen name="person/[id]/prep" options={{ title: "Prep brief" }} />
            <Stack.Screen name="pending" options={{ title: "Saved recordings" }} />
            <Stack.Screen name="profile" options={{ title: "Your profile" }} />
            <Stack.Screen name="account" options={{ title: "Profile settings" }} />
            <Stack.Screen name="terms" options={{ title: "Terms of use" }} />
            <Stack.Screen name="about" options={{ title: "About Memory AI" }} />
            <Stack.Screen name="feedback" options={{ title: "Send feedback" }} />
          </Stack>
        </AppLock>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
