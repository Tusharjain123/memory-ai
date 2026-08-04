export const DATABASE_NAME = "memory-ai.db";
export const SCHEMA_VERSION = 4;

export const MIGRATION_1 = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  main_goal TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  language TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  raw_transcript TEXT NOT NULL,
  clean_transcript TEXT NOT NULL,
  roman_hinglish_transcript TEXT NOT NULL,
  recording_uri TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  last_interaction_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_people (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  PRIMARY KEY (conversation_id, person_id)
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  clean_text TEXT NOT NULL,
  roman_hinglish_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  owner TEXT,
  due_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  text TEXT NOT NULL,
  vector_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_segments_conversation ON transcript_segments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_actions_completed ON action_items(completed);
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id);
`;

export const MIGRATION_2 = `
CREATE TABLE IF NOT EXISTS pending_recordings (
  id TEXT PRIMARY KEY NOT NULL,
  recording_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_recordings_created
ON pending_recordings(created_at DESC);
`;

export const MIGRATION_3 = `
ALTER TABLE embeddings
ADD COLUMN model TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_embeddings_model
ON embeddings(model);
`;

export const MIGRATION_4 = `
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'me'),
  name TEXT,
  age INTEGER CHECK (age IS NULL OR (age >= 1 AND age <= 120)),
  gender TEXT,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
