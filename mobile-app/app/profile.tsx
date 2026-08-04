import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type KeyboardTypeOptions,
} from "react-native";
import { deleteUserProfile, EMPTY_PROFILE, getUserProfile, saveUserProfile, type UserProfile } from "../src/db/profile";
import { radii, shadows, spacing, typeScale, useAppTheme } from "../src/theme";

function ProfileField({ label, value, placeholder, icon, keyboardType = "default", onChangeText }: {
  label: string; value: string; placeholder: string; icon: keyof typeof Ionicons.glyphMap;
  keyboardType?: KeyboardTypeOptions; onChangeText: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <View style={[styles.inputShell, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Ionicons name={icon} size={19} color={colors.accent} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
          autoCorrect={keyboardType !== "email-address"}
          onChangeText={onChangeText}
          style={[styles.input, { color: colors.ink }]}
        />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { colors, isDark } = useAppTheme();
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [hasProfile, setHasProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getUserProfile().then((stored) => {
      if (stored) { setProfile(stored); setHasProfile(true); }
      setLoaded(true);
    });
  }, []);

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save(): Promise<void> {
    if (profile.email && !/^\S+@\S+\.\S+$/.test(profile.email.trim())) {
      Alert.alert("Check the email", "Enter a valid email address or leave it blank."); return;
    }
    setSaving(true);
    try {
      await saveUserProfile(profile);
      setHasProfile(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Profile saved", "Your details have been updated.");
    } catch (cause) {
      Alert.alert("Couldn’t save profile", cause instanceof Error ? cause.message : "Please try again.");
    } finally { setSaving(false); }
  }

  function confirmDelete(): void {
    Alert.alert("Remove profile details?", "Your memories will not be affected.", [
      { text: "Keep profile", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void deleteUserProfile().then(() => {
        setProfile(EMPTY_PROFILE); setHasProfile(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.surface }]}> 
            <Text style={[styles.initial, { color: colors.accent }]}>{profile.name.trim().slice(0, 1).toUpperCase() || "M"}</Text>
          </View>
        </View>

        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Personal details</Text>
        <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.line }, !isDark && shadows.card]}>
          <ProfileField label="Name" value={profile.name} placeholder="Your name" icon="person-outline" onChangeText={(value) => update("name", value)} />
          <ProfileField label="Age" value={profile.age?.toString() ?? ""} placeholder="Optional" icon="calendar-outline" keyboardType="number-pad"
            onChangeText={(value) => { const digits = value.replace(/\D/g, "").slice(0, 3); update("age", digits ? Number(digits) : null); }} />
          <ProfileField label="Gender" value={profile.gender} placeholder="How you describe yourself" icon="people-outline" onChangeText={(value) => update("gender", value)} />
          <ProfileField label="Email" value={profile.email} placeholder="you@example.com" icon="mail-outline" keyboardType="email-address" onChangeText={(value) => update("email", value)} />
          <ProfileField label="Phone" value={profile.phone} placeholder="Optional phone number" icon="call-outline" keyboardType="phone-pad" onChangeText={(value) => update("phone", value)} />
        </View>

        <Pressable accessibilityRole="button" disabled={!loaded || saving} onPress={() => void save()}
          style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.accent }, pressed && styles.pressed, (!loaded || saving) && { opacity: 0.55 }]}>
          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          <Text style={styles.saveText}>{saving ? "Saving…" : hasProfile ? "Save changes" : "Save profile"}</Text>
        </Pressable>

        {hasProfile ? <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.removeButton}>
          <Text style={[styles.removeText, { color: colors.danger }]}>Remove profile details</Text>
        </Pressable> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  profileHeader: { alignItems: "center", paddingVertical: spacing.md },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 7, alignItems: "center", justifyContent: "center", ...shadows.floating },
  initial: { fontSize: 30, fontWeight: "800" },
  sectionTitle: { fontSize: typeScale.title3, fontWeight: "800", letterSpacing: -0.4, marginTop: spacing.md, marginBottom: spacing.sm },
  form: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
  fieldGroup: { gap: 7 },
  label: { fontSize: 13, fontWeight: "800", marginLeft: 2 },
  inputShell: { minHeight: 54, borderWidth: 1, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  input: { flex: 1, minHeight: 52, fontSize: typeScale.body },
  saveButton: { minHeight: 58, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.xl },
  saveText: { color: "#FFFFFF", fontSize: typeScale.bodyLarge, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  removeButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  removeText: { fontSize: 13, fontWeight: "700" },
});
