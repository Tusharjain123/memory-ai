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

const CHECKLIST_DISMISSED_KEY = "memory-ai.getting-started-dismissed.v1";
const FIRST_MEMORY_CELEBRATED_KEY = "memory-ai.first-memory-celebrated.v1";

export async function isChecklistDismissed(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CHECKLIST_DISMISSED_KEY)) === "true";
}

export async function dismissChecklist(): Promise<void> {
  await SecureStore.setItemAsync(CHECKLIST_DISMISSED_KEY, "true");
}

/** True exactly once: the first time it's asked after a first memory exists. */
export async function claimFirstMemoryCelebration(): Promise<boolean> {
  if (await SecureStore.getItemAsync(FIRST_MEMORY_CELEBRATED_KEY)) return false;
  await SecureStore.setItemAsync(FIRST_MEMORY_CELEBRATED_KEY, "true");
  return true;
}
