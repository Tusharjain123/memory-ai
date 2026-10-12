import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { CLOUD_CONFIG } from "../config/cloud";

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/meetings.space.readonly",
];

let configuredScopes: string | null = null;

/** Configure once; pass extra scopes to request them on the next interactive sign-in. */
export function configureGoogle(extraScopes: string[] = []): void {
  if (!CLOUD_CONFIG) return;
  const scopes = ["email", "profile", ...extraScopes];
  const key = scopes.join(" ");
  if (configuredScopes === key) return;
  GoogleSignin.configure({
    webClientId: CLOUD_CONFIG.googleWebClientId,
    ...(CLOUD_CONFIG.googleIosClientId ? { iosClientId: CLOUD_CONFIG.googleIosClientId } : {}),
    scopes,
    // Lets "Connect Calendar & Meet" hand the backend a one-time server auth code.
    offlineAccess: true,
  });
  configuredScopes = key;
}
