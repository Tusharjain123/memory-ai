import { describe, expect, it } from "vitest";
import {
  isUniqueViolation,
  nextCursor,
  shouldApplyRemote,
  uniqueFolderName,
  validateFolderName,
} from "./folderSyncMerge";
import { resolveCloudConfig } from "../config/cloud";

describe("folder sync merge", () => {
  it("applies remote rows only when newer (last write wins)", () => {
    expect(shouldApplyRemote(null, { updatedAt: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(shouldApplyRemote({ updatedAt: "2026-01-02T00:00:00Z" }, { updatedAt: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(shouldApplyRemote({ updatedAt: "2026-01-01T00:00:00Z" }, { updatedAt: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(shouldApplyRemote({ updatedAt: "2026-01-01T00:00:00Z" }, { updatedAt: "2026-01-03T00:00:00Z" })).toBe(true);
  });

  it("de-duplicates clashing folder names case-insensitively", () => {
    expect(uniqueFolderName("Work", ["Home"])).toBe("Work");
    expect(uniqueFolderName("Work", ["work"])).toBe("Work (2)");
    expect(uniqueFolderName("Work", ["Work", "Work (2)"])).toBe("Work (3)");
    expect(uniqueFolderName("x".repeat(80), ["x".repeat(80)])).toHaveLength(80);
  });

  it("validates and normalises names", () => {
    expect(validateFolderName("  Client   calls ")).toBe("Client calls");
    expect(() => validateFolderName("   ")).toThrow("Give the folder a name");
    expect(() => validateFolderName("x".repeat(81))).toThrow("up to 80");
  });

  it("advances the pull cursor to the newest server timestamp", () => {
    expect(nextCursor(null, [])).toBeNull();
    expect(nextCursor("2026-01-01T00:00:00Z", [
      { server_updated_at: "2026-01-03T00:00:00Z" },
      { server_updated_at: "2026-01-02T00:00:00Z" },
    ])).toBe("2026-01-03T00:00:00Z");
  });

  it("recognises unique violations", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("resolveCloudConfig", () => {
  it("disables cloud features unless every required value is set", () => {
    expect(resolveCloudConfig({})).toBeNull();
    expect(resolveCloudConfig({
      EXPO_PUBLIC_SUPABASE_URL: "https://p.supabase.co/",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    })).toBeNull();
    expect(resolveCloudConfig({
      EXPO_PUBLIC_SUPABASE_URL: "https://p.supabase.co/",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
    })).toEqual({
      supabaseUrl: "https://p.supabase.co",
      supabasePublishableKey: "sb_publishable_x",
      googleWebClientId: "web.apps.googleusercontent.com",
      googleIosClientId: undefined,
    });
  });
});
