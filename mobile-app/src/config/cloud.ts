export type CloudConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  googleWebClientId: string;
  googleIosClientId: string | undefined;
};

/**
 * Cloud features are optional. When any required value is missing the app
 * simply hides "Connect Google" and keeps working on-device.
 */
export function resolveCloudConfig(env: Record<string, string | undefined>): CloudConfig | null {
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const supabasePublishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const googleWebClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!supabaseUrl || !supabasePublishableKey || !googleWebClientId) return null;
  return {
    supabaseUrl,
    supabasePublishableKey,
    googleWebClientId,
    googleIosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
  };
}

// Expo only inlines EXPO_PUBLIC_* when accessed statically.
export const CLOUD_CONFIG = resolveCloudConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});
