import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic, useFonts } from "@expo-google-fonts/instrument-serif";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAppTheme } from "../src/theme";
import { AppLock } from "../src/components/AppLock";
import { useThemeStore } from "../src/store/useThemeStore";
import { bindProcessingAppState } from "../src/services/processingOrchestrator";
import { hydrateCloudAccount } from "../src/services/cloudAuth";
import { bindFolderSync } from "../src/services/folderSync";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { colors, isDark } = useAppTheme();
  // Headline font; if it fails to load we fall back to the system font.
  const [fontsLoaded, fontError] = useFonts({ InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic });
  const fontsReady = fontsLoaded || fontError !== null;
  const hydrateTheme = useThemeStore((state) => state.hydrate);

  useEffect(() => {
    void hydrateTheme();
  }, [hydrateTheme]);

  useEffect(() => bindProcessingAppState(), []);

  // Optional cloud account: restores a saved session, never blocks the app.
  useEffect(() => {
    void hydrateCloudAccount();
    return bindFolderSync();
  }, []);

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady]);

  if (!fontsReady) return null;

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
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="record" options={{ title: "New memory", presentation: "modal", gestureEnabled: false }} />
            <Stack.Screen name="conversation/[id]" options={{ title: "Memory" }} />
            <Stack.Screen name="review/[id]" options={{ title: "Review memory" }} />
            <Stack.Screen name="commitments" options={{ title: "Commitments" }} />
            <Stack.Screen name="search" options={{ title: "Ask Memory" }} />
            <Stack.Screen name="settings" options={{ title: "Privacy" }} />
            <Stack.Screen name="person/[id]" options={{ title: "Person" }} />
            <Stack.Screen name="person/[id]/prep" options={{ title: "Prep brief" }} />
            <Stack.Screen name="pending" options={{ title: "Saved recordings" }} />
            <Stack.Screen name="profile" options={{ title: "Your profile" }} />
            <Stack.Screen name="account" options={{ title: "Profile settings" }} />
            <Stack.Screen name="terms" options={{ title: "Terms of use" }} />
            <Stack.Screen name="about" options={{ title: "About Memory AI" }} />
            <Stack.Screen name="feedback" options={{ title: "Send feedback" }} />
            <Stack.Screen name="cloud" options={{ title: "Cloud & account" }} />
            <Stack.Screen name="folders" options={{ title: "Folders" }} />
            <Stack.Screen name="folder/[id]" options={{ title: "Folder" }} />
            <Stack.Screen name="meeting/[id]" options={{ title: "Meeting" }} />
            <Stack.Screen name="wallet" options={{ title: "Wallet" }} />
            <Stack.Screen name="add-to-folder" options={{ title: "Add to folder", presentation: "modal" }} />
          </Stack>
        </AppLock>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
