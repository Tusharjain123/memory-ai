export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const CHUNK_SIZE = 1_800;

function safeKey(key: string): string {
  // SecureStore keys allow only alphanumerics, ".", "-" and "_".
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Supabase session storage on top of SecureStore. Sessions are larger than
 * SecureStore's ~2 KB comfort limit, so values are split across keys.
 */
export function createChunkedSecureStorage(store: KeyValueStore) {
  async function removeItem(key: string): Promise<void> {
    const base = safeKey(key);
    const count = Number(await store.getItemAsync(`${base}.n`)) || 0;
    await Promise.all(
      Array.from({ length: count }, (_, index) => store.deleteItemAsync(`${base}.${index}`)),
    );
    await store.deleteItemAsync(`${base}.n`);
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const base = safeKey(key);
      const count = Number(await store.getItemAsync(`${base}.n`)) || 0;
      if (!count) return null;
      const parts = await Promise.all(
        Array.from({ length: count }, (_, index) => store.getItemAsync(`${base}.${index}`)),
      );
      if (parts.some((part) => part == null)) return null;
      return parts.join("");
    },
    async setItem(key: string, value: string): Promise<void> {
      const base = safeKey(key);
      await removeItem(key);
      const chunks: string[] = [];
      for (let start = 0; start < value.length; start += CHUNK_SIZE) {
        chunks.push(value.slice(start, start + CHUNK_SIZE));
      }
      if (!chunks.length) chunks.push("");
      await Promise.all(chunks.map((chunk, index) => store.setItemAsync(`${base}.${index}`, chunk)));
      await store.setItemAsync(`${base}.n`, String(chunks.length));
    },
    removeItem,
  };
}
