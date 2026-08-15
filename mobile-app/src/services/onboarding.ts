import * as SecureStore from "expo-secure-store";
import { listConversations } from "../db/conversations";
import { listPendingRecordings } from "../db/pendingRecordings";
import { getUserProfile } from "../db/profile";

const ONBOARDING_KEY = "memory-ai.onboarding-complete.v1";

/**
 * Only introduce the guide to people who have not started using Memory yet.
 * This keeps upgrades and returning users on the screen they expect.
 */
export async function shouldShowOnboarding(): Promise<boolean> {
  if (await SecureStore.getItemAsync(ONBOARDING_KEY)) return false;

  const [conversations, pending, profile] = await Promise.all([
    listConversations(),
    listPendingRecordings(),
    getUserProfile(),
  ]);
  return conversations.length === 0 && pending.length === 0 && profile === null;
}

export async function completeOnboarding(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
}
