/** Pure helpers for folder sync; no React Native imports so they unit-test in node. */

export const FOLDER_NAME_MAX = 80;

export function cleanFolderName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function validateFolderName(name: string): string {
  const clean = cleanFolderName(name);
  if (!clean) throw new Error("Give the folder a name");
  if (clean.length > FOLDER_NAME_MAX) throw new Error(`Folder names can be up to ${FOLDER_NAME_MAX} characters`);
  return clean;
}

/** Last write wins on the client-set updated_at. Missing local rows always apply. */
export function shouldApplyRemote(
  local: { updatedAt: string } | null | undefined,
  remote: { updatedAt: string },
): boolean {
  if (!local) return true;
  return Date.parse(remote.updatedAt) > Date.parse(local.updatedAt);
}

/** "Work" → "Work (2)" → "Work (3)" when another live folder already uses the name. */
export function uniqueFolderName(name: string, takenNames: Iterable<string>): string {
  const taken = new Set([...takenNames].map((item) => item.toLocaleLowerCase()));
  if (!taken.has(name.toLocaleLowerCase())) return name;
  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const tail = ` (${suffix})`;
    const candidate = `${name.slice(0, FOLDER_NAME_MAX - tail.length)}${tail}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `${name.slice(0, FOLDER_NAME_MAX - 9)} (${Date.now() % 100_000})`;
}

/** Highest server_updated_at seen, used as the next incremental pull cursor. */
export function nextCursor(current: string | null, rows: Array<{ server_updated_at: string }>): string | null {
  let cursor = current;
  for (const row of rows) {
    if (!cursor || Date.parse(row.server_updated_at) > Date.parse(cursor)) cursor = row.server_updated_at;
  }
  return cursor;
}

/** PostgREST unique-violation (two devices created the same folder name). */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
