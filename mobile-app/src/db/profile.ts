import { getDatabase } from "./database";

export type UserProfile = {
  name: string;
  age: number | null;
  gender: string;
  email: string;
  phone: string;
  occupation: string;
  onboardingGoal: string;
};

type ProfileRow = {
  name: string | null;
  age: number | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  onboarding_goal: string | null;
};

export const EMPTY_PROFILE: UserProfile = { name: "", age: null, gender: "", email: "", phone: "", occupation: "", onboardingGoal: "" };

export async function getUserProfile(): Promise<UserProfile | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<ProfileRow>("SELECT name, age, gender, email, phone, occupation, onboarding_goal FROM user_profile WHERE id = 'me'");
  return row ? {
    name: row.name ?? "", age: row.age, gender: row.gender ?? "", email: row.email ?? "", phone: row.phone ?? "",
    occupation: row.occupation ?? "", onboardingGoal: row.onboarding_goal ?? "",
  } : null;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO user_profile (id, name, age, gender, email, phone, occupation, onboarding_goal, created_at, updated_at)
     VALUES ('me', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, age = excluded.age, gender = excluded.gender,
       email = excluded.email, phone = excluded.phone, occupation = excluded.occupation,
       onboarding_goal = excluded.onboarding_goal, updated_at = excluded.updated_at`,
    profile.name.trim() || null, profile.age, profile.gender.trim() || null, profile.email.trim() || null,
    profile.phone.trim() || null, profile.occupation.trim() || null, profile.onboardingGoal.trim() || null, now, now,
  );
}

export async function deleteUserProfile(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM user_profile WHERE id = 'me'");
}
