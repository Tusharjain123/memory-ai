import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { CLOUD_CONFIG } from "../config/cloud";
import { createChunkedSecureStorage } from "./secureSessionStorage";

let client: SupabaseClient | null | undefined;

/** Null when cloud features aren't configured for this build. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!CLOUD_CONFIG) {
    client = null;
    return client;
  }
  const created = createClient(CLOUD_CONFIG.supabaseUrl, CLOUD_CONFIG.supabasePublishableKey, {
    auth: {
      storage: createChunkedSecureStorage(SecureStore),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  AppState.addEventListener("change", (state) => {
    if (state === "active") void created.auth.startAutoRefresh();
    else void created.auth.stopAutoRefresh();
  });
  client = created;
  return client;
}
