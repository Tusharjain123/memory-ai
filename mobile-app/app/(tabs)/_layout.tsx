import { Tabs } from "expo-router";
import { FloatingTabBar } from "../../src/components/FloatingTabBar";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useAppTheme } from "../../src/theme";

export default function TabsLayout() {
  const { colors } = useAppTheme();
  // Calendar needs the optional Google connection; builds without cloud config hide it.
  const calendarHidden = useAuthStore((state) => state.status === "unavailable");
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="memories" />
      <Tabs.Screen name="calendar" options={{ tabHidden: calendarHidden } as never} />
      <Tabs.Screen name="people" />
    </Tabs>
  );
}
