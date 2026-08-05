import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

export type ThemePreference = "system" | "dark" | "light";

const THEME_KEY = "memory-ai.theme-preference";

type ThemeState = {
  preference: ThemePreference;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
  hydrate: () => Promise<void>;
};

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "dark" || value === "light";
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: "system",
  hydrated: false,
  setPreference: async (preference) => {
    await SecureStore.setItemAsync(THEME_KEY, preference);
    set({ preference });
  },
  hydrate: async () => {
    const stored = await SecureStore.getItemAsync(THEME_KEY);
    set({
      preference: isThemePreference(stored) ? stored : "system",
      hydrated: true,
    });
  },
}));
