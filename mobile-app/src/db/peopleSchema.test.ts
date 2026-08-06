import { describe, expect, it } from "vitest";
import { MIGRATION_5, SCHEMA_VERSION } from "./schema";

describe("people profile migration", () => {
  it("adds editable profile fields and stable speaker mappings", () => {
    expect(SCHEMA_VERSION).toBe(5);
    expect(MIGRATION_5).toContain("ADD COLUMN relationship");
    expect(MIGRATION_5).toContain("ADD COLUMN email");
    expect(MIGRATION_5).toContain("ADD COLUMN phone");
    expect(MIGRATION_5).toContain("ADD COLUMN notes");
    expect(MIGRATION_5).toContain("idx_conversation_people_speaker");
  });

  it("backfills unnamed transcript speakers as editable placeholders", () => {
    expect(MIGRATION_5).toContain("is_placeholder");
    expect(MIGRATION_5).toContain("JOIN transcript_segments");
    expect(MIGRATION_5).toContain("INSERT OR IGNORE INTO conversation_people");
  });
});
