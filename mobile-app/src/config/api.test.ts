import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "./api";

describe("resolveApiUrl", () => {
  it("allows the Android emulator HTTP bridge only during development", () => {
    expect(resolveApiUrl(undefined, true)).toBe("http://10.0.2.2:3000");
  });

  it("requires an explicit endpoint in production", () => {
    expect(() => resolveApiUrl(undefined, false)).toThrow(
      "EXPO_PUBLIC_API_URL is required",
    );
  });

  it("rejects plaintext production endpoints", () => {
    expect(() => resolveApiUrl("http://api.example.com", false)).toThrow(
      "must use HTTPS",
    );
  });

  it("normalizes a secure production endpoint", () => {
    expect(resolveApiUrl("https://api.example.com/", false)).toBe(
      "https://api.example.com",
    );
  });
});
