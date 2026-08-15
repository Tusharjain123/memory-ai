export const DATABASE_NAME = "memory-ai.db";
export const SCHEMA_VERSION = 8;

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

export const MIGRATION_5 = `
ALTER TABLE people ADD COLUMN relationship TEXT;
ALTER TABLE people ADD COLUMN email TEXT;
ALTER TABLE people ADD COLUMN phone TEXT;
ALTER TABLE people ADD COLUMN notes TEXT;
ALTER TABLE people ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE people ADD COLUMN is_placeholder INTEGER NOT NULL DEFAULT 0;

UPDATE people
SET updated_at = last_interaction_at
WHERE updated_at = '';

DELETE FROM conversation_people
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM conversation_people
  GROUP BY conversation_id, speaker_label
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_people_speaker
ON conversation_people(conversation_id, speaker_label);

INSERT OR IGNORE INTO people
  (id,name,last_interaction_at,updated_at,is_placeholder)
SELECT
  c.id || ':speaker:' || ts.speaker_label,
  ts.speaker_label || ' · ' || c.id,
  c.created_at,
  c.created_at,
  1
FROM conversations c
JOIN transcript_segments ts ON ts.conversation_id = c.id
LEFT JOIN conversation_people cp
  ON cp.conversation_id = c.id AND cp.speaker_label = ts.speaker_label
WHERE cp.person_id IS NULL
GROUP BY c.id, ts.speaker_label;

INSERT OR IGNORE INTO conversation_people
  (conversation_id,person_id,speaker_label)
SELECT
  c.id,
  c.id || ':speaker:' || ts.speaker_label,
  ts.speaker_label
FROM conversations c
JOIN transcript_segments ts ON ts.conversation_id = c.id
LEFT JOIN conversation_people cp
  ON cp.conversation_id = c.id AND cp.speaker_label = ts.speaker_label
WHERE cp.person_id IS NULL
GROUP BY c.id, ts.speaker_label;
`;

export const MIGRATION_6 = `
CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  direction TEXT NOT NULL,
  owner_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  counterparty_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  due_at TEXT,
  confidence TEXT NOT NULL,
  status TEXT NOT NULL,
  memory_class TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  segment_id TEXT,
  quote TEXT,
  start_ms INTEGER,
  speaker_label TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status, approval_status);
CREATE INDEX IF NOT EXISTS idx_commitments_conversation ON commitments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_commitments_owner ON commitments(owner_person_id);
CREATE INDEX IF NOT EXISTS idx_commitments_counterparty ON commitments(counterparty_person_id);

CREATE TABLE IF NOT EXISTS person_memories (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  memory_class TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  confidence TEXT NOT NULL,
  segment_id TEXT,
  quote TEXT,
  start_ms INTEGER,
  speaker_label TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_person_memories_person ON person_memories(person_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_person_memories_conversation ON person_memories(conversation_id);

CREATE TABLE IF NOT EXISTS memory_reviews (
  conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  pending_count INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE decisions ADD COLUMN confidence TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE decisions ADD COLUMN segment_id TEXT;
ALTER TABLE decisions ADD COLUMN quote TEXT;
ALTER TABLE decisions ADD COLUMN start_ms INTEGER;
ALTER TABLE decisions ADD COLUMN speaker_label TEXT;
ALTER TABLE decisions ADD COLUMN memory_class TEXT NOT NULL DEFAULT 'ai_inference';
ALTER TABLE decisions ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';

INSERT INTO commitments
  (id,conversation_id,text,direction,owner_person_id,counterparty_person_id,due_at,
   confidence,status,memory_class,approval_status,segment_id,quote,start_ms,speaker_label,
   expires_at,created_at,updated_at)
SELECT
  a.id,
  a.conversation_id,
  a.task,
  'unclear',
  NULL,
  NULL,
  a.due_at,
  'medium',
  CASE WHEN a.completed=1 THEN 'completed' ELSE 'proposed' END,
  'ai_inference',
  'approved',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  c.created_at,
  c.updated_at
FROM action_items a
JOIN conversations c ON c.id = a.conversation_id;

UPDATE commitments
SET owner_person_id = (
  SELECT p.id FROM people p
  JOIN action_items a ON a.id = commitments.id
  WHERE a.owner IS NOT NULL
    AND p.name = a.owner COLLATE NOCASE
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM action_items a
  WHERE a.id = commitments.id AND a.owner IS NOT NULL
);

INSERT INTO memory_reviews (conversation_id, pending_count, completed_at, created_at)
SELECT id, 0, created_at, created_at FROM conversations;
`;

export const MIGRATION_7 = `
ALTER TABLE pending_recordings ADD COLUMN upload_id TEXT;
ALTER TABLE pending_recordings ADD COLUMN upload_part_index INTEGER;
ALTER TABLE pending_recordings ADD COLUMN processing_job_id TEXT;
ALTER TABLE pending_recordings ADD COLUMN duration_ms INTEGER;
`;

export const MIGRATION_8 = `
ALTER TABLE user_profile ADD COLUMN occupation TEXT;
ALTER TABLE user_profile ADD COLUMN onboarding_goal TEXT;
`;
