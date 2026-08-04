const ANDROID_EMULATOR_API = "http://10.0.2.2:3000";

export function resolveApiUrl(
  configuredUrl: string | undefined,
  development: boolean,
): string {
  const candidate = configuredUrl?.trim();
  if (!candidate) {
    if (development) return ANDROID_EMULATOR_API;
    throw new Error("EXPO_PUBLIC_API_URL is required in production");
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be a valid absolute URL");
  }
  if (!development && url.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTPS in production");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTP or HTTPS");
  }
  return candidate.replace(/\/+$/, "");
}

const IS_DEVELOPMENT =
  typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

export const API_URL = resolveApiUrl(
  process.env.EXPO_PUBLIC_API_URL,
  IS_DEVELOPMENT,
);
