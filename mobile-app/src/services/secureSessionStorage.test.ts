import { describe, expect, it } from "vitest";
import { createChunkedSecureStorage, type KeyValueStore } from "./secureSessionStorage";

function memoryStore(): KeyValueStore & { keys: Map<string, string> } {
  const keys = new Map<string, string>();
  return {
    keys,
    getItemAsync: async (key) => keys.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid key ${key}`);
      keys.set(key, value);
    },
    deleteItemAsync: async (key) => {
      keys.delete(key);
    },
  };
}

describe("createChunkedSecureStorage", () => {
  it("round-trips a large session across chunks", async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store);
    const session = JSON.stringify({ token: "x".repeat(5_000) });
    await storage.setItem("sb-project-auth-token", session);
    expect(store.keys.get("sb-project-auth-token.n")).toBe("3");
    await expect(storage.getItem("sb-project-auth-token")).resolves.toBe(session);
  });

  it("drops stale chunks when the value shrinks and on remove", async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store);
    await storage.setItem("k", "y".repeat(4_000));
    await storage.setItem("k", "short");
    expect([...store.keys.keys()].sort()).toEqual(["k.0", "k.n"]);
    await expect(storage.getItem("k")).resolves.toBe("short");
    await storage.removeItem("k");
    expect(store.keys.size).toBe(0);
    await expect(storage.getItem("k")).resolves.toBeNull();
  });

  it("sanitizes keys SecureStore would reject", async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store);
    await storage.setItem("sb:auth/token", "v");
    await expect(storage.getItem("sb:auth/token")).resolves.toBe("v");
  });
});
