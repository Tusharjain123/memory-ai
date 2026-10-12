import { getUserProfile, saveUserProfile, EMPTY_PROFILE } from "../db/profile";
import { useAuthStore } from "../store/useAuthStore";
import { getSupabase } from "./supabase";

/** Server truth for the opt-in; never trust only the cached flag before uploading. */
export async function fetchCloudSyncEnabled(): Promise<boolean> {
  const supabase = getSupabase();
  const userId = useAuthStore.getState().userId;
  if (!supabase || !userId) return false;
  const { data, error } = await supabase
    .from("users")
    .select("cloud_sync_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const enabled = Boolean(data?.cloud_sync_enabled);
  useAuthStore.getState().patch({ cloudSyncEnabled: enabled });
  return enabled;
}

/** Push profile details only while the user has chosen cloud storage. */
export async function pushProfileToCloud(): Promise<boolean> {
  const supabase = getSupabase();
  const userId = useAuthStore.getState().userId;
  if (!supabase || !userId) return false;
  if (!(await fetchCloudSyncEnabled())) return false;
  const profile = await getUserProfile();
  if (!profile) return false;
  const { error } = await supabase
    .from("users")
    .update({
      ...(profile.name.trim() ? { name: profile.name.trim() } : {}),
      age: profile.age,
      gender: profile.gender.trim() || null,
      phone_number: profile.phone.trim() || null,
      metadata: {
        occupation: profile.occupation.trim() || null,
        onboarding_goal: profile.onboardingGoal.trim() || null,
      },
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  return true;
}

/** First connect: borrow the Google name/email for an empty local profile. */
export async function fillLocalProfileFromGoogle(name: string | null, email: string | null): Promise<void> {
  const profile = (await getUserProfile()) ?? EMPTY_PROFILE;
  const next = {
    ...profile,
    name: profile.name.trim() || name?.trim() || "",
    email: profile.email.trim() || email?.trim() || "",
  };
  if (next.name !== profile.name || next.email !== profile.email) {
    await saveUserProfile(next);
  }
}
