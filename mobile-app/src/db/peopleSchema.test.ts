import { describe, expect, it } from "vitest";
import { MIGRATION_5, MIGRATION_6, MIGRATION_7, MIGRATION_8, SCHEMA_VERSION } from "./schema";

describe("people profile migration", () => {
  it("adds editable profile fields and stable speaker mappings", () => {
    expect(SCHEMA_VERSION).toBe(8);
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

describe("commitment memory migration", () => {
  it("creates commitments, person memories, and review inbox tables", () => {
    expect(MIGRATION_6).toContain("CREATE TABLE IF NOT EXISTS commitments");
    expect(MIGRATION_6).toContain("CREATE TABLE IF NOT EXISTS person_memories");
    expect(MIGRATION_6).toContain("CREATE TABLE IF NOT EXISTS memory_reviews");
    expect(MIGRATION_6).toContain("ALTER TABLE decisions ADD COLUMN confidence");
    expect(MIGRATION_6).toContain("INSERT INTO commitments");
  });
});

describe("resumable upload migration", () => {
  it("stores upload and processing resume fields on pending recordings", () => {
    expect(MIGRATION_7).toContain("ADD COLUMN upload_id");
    expect(MIGRATION_7).toContain("ADD COLUMN upload_part_index");
    expect(MIGRATION_7).toContain("ADD COLUMN processing_job_id");
    expect(MIGRATION_7).toContain("ADD COLUMN duration_ms");
  });
});

describe("onboarding profile migration", () => {
  it("stores the user's role and intended use locally", () => {
    expect(MIGRATION_8).toContain("ADD COLUMN occupation");
    expect(MIGRATION_8).toContain("ADD COLUMN onboarding_goal");
  });
});
