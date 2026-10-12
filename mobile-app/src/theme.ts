import { useColorScheme } from "react-native";
import { useThemeStore, type ThemePreference } from "./store/useThemeStore";

export type AppColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  sage: string;
  sageSoft: string;
  line: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  warm: string;
  warmSoft: string;
};

export const lightColors: AppColors = {
  background: "#FBFDFC",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#F3F8F8",
  ink: "#12346B",
  muted: "#7182A1",
  faint: "#A8B3C8",
  accent: "#16AF99",
  accentPressed: "#0B8E7D",
  accentSoft: "#DDF7F2",
  sage: "#16AF99",
  sageSoft: "#E6F8F4",
  line: "#E6ECF2",
  danger: "#E0474C",
  dangerSoft: "#FDECEE",
  overlay: "rgba(18,52,107,0.08)",
  warm: "#E8875A",
  warmSoft: "#FFF1E8",
};

export const darkColors: AppColors = {
  background: "#081426",
  surface: "#10213A",
  surfaceElevated: "#162A46",
  surfaceMuted: "#1A304C",
  ink: "#F4F8FF",
  muted: "#A6B6CC",
  faint: "#7488A5",
  accent: "#36D2BC",
  accentPressed: "#68E1D1",
  accentSoft: "#123D42",
  sage: "#36D2BC",
  sageSoft: "#123B3E",
  line: "#203958",
  danger: "#F18A80",
  dangerSoft: "#3B2423",
  overlay: "rgba(0,0,0,0.22)",
  warm: "#F4A57E",
  warmSoft: "#3A2A24",
};

/** Meeting tints: soft background, readable ink and a strong edge colour. */
export type Pastel = { soft: string; ink: string; edge: string };

const LIGHT_PASTELS: Pastel[] = [
  { soft: "#E3F6EF", ink: "#0F5C4F", edge: "#16AF99" },
  { soft: "#FFF0DF", ink: "#7A4515", edge: "#E8875A" },
  { soft: "#ECEBFF", ink: "#3B3486", edge: "#7C72E8" },
  { soft: "#FFE8EE", ink: "#80283F", edge: "#E26487" },
  { soft: "#E5F1FF", ink: "#1C4A7E", edge: "#4C8EDB" },
];

const DARK_PASTELS: Pastel[] = [
  { soft: "#123D3A", ink: "#BDF2E7", edge: "#36D2BC" },
  { soft: "#3A2A1C", ink: "#FFD9BC", edge: "#F4A57E" },
  { soft: "#25234A", ink: "#D8D4FF", edge: "#9C93F2" },
  { soft: "#3D1F2A", ink: "#FFC9D6", edge: "#F08AA6" },
  { soft: "#172F4D", ink: "#C8E0FF", edge: "#76AAEA" },
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

/** Stable pastel for a meeting or person, so the same event keeps its colour everywhere. */
export function pastelFor(seed: string, isDark: boolean): Pastel {
  const palette = isDark ? DARK_PASTELS : LIGHT_PASTELS;
  return palette[hashSeed(seed) % palette.length]!;
}

/** Editorial serif for large headlines; body text stays on the system font. */
export const fonts = {
  display: "InstrumentSerif_400Regular",
  displayItalic: "InstrumentSerif_400Regular_Italic",
} as const;

// Backward-compatible light palette for non-hook utility modules.
export const colors = lightColors;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const typeScale = {
  caption: 12,
  body: 15,
  bodyLarge: 17,
  title3: 20,
  title2: 26,
  title1: 34,
  display: 44,
} as const;

export const shadows = {
  card: {
    shadowColor: "#4E8A9F",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 1,
  },
  floating: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
} as const;

export function resolveIsDark(preference: ThemePreference, systemScheme: string | null | undefined): boolean {
  if (preference === "dark") return true;
  if (preference === "light") return false;
  return systemScheme === "dark";
}

export function useAppTheme(): {
  colors: AppColors;
  isDark: boolean;
  preference: ThemePreference;
} {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((state) => state.preference);
  const isDark = resolveIsDark(preference, systemScheme);
  return { colors: isDark ? darkColors : lightColors, isDark, preference };
}
