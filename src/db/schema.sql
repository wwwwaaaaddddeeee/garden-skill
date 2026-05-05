-- Garden Skill schema
-- Single SQLite file. Lives wherever the user wants.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- One row per image file.
CREATE TABLE IF NOT EXISTS images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  path          TEXT    NOT NULL UNIQUE,
  sha256        TEXT    NOT NULL,
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  format        TEXT    NOT NULL,        -- 'jpeg', 'png', 'webp', 'gif', 'heic'
  file_size     INTEGER NOT NULL,
  phash         TEXT,                    -- 64-bit perceptual hash, hex string
  scanned_at    INTEGER NOT NULL,
  enriched_at   INTEGER,                 -- nullable; set when agent has tagged it
  enriched_by   TEXT                     -- e.g. 'claude-haiku-4-5', 'gpt-4o', 'human'
);

CREATE INDEX IF NOT EXISTS images_sha256       ON images(sha256);
CREATE INDEX IF NOT EXISTS images_phash        ON images(phash);
CREATE INDEX IF NOT EXISTS images_enriched_at  ON images(enriched_at);

-- Optional: source-of-record metadata (e.g. gallery-dl JSON sidecar contents)
CREATE TABLE IF NOT EXISTS image_source (
  image_id      INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  source        TEXT,                    -- 'pinterest', 'upload', 'dribbble', etc.
  source_id     TEXT,                    -- e.g. Pinterest pin ID
  source_url    TEXT,                    -- original URL
  source_alt    TEXT,                    -- alt text / caption
  source_json   TEXT                     -- full JSON blob, optional
);

CREATE INDEX IF NOT EXISTS image_source_source_id ON image_source(source_id);

-- Color palette (deterministic, extracted locally — no LLM needed)
CREATE TABLE IF NOT EXISTS image_palette (
  image_id      INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,        -- 0 = most dominant
  hex           TEXT    NOT NULL,
  oklch         TEXT    NOT NULL,
  population    REAL    NOT NULL,        -- fraction of pixels (0..1)
  role          TEXT,                    -- nullable; agent fills later: 'background', 'accent', etc.
  PRIMARY KEY (image_id, position)
);

-- Structured tags written by the agent after vision pass.
-- Stored as JSON for flexibility; FTS view below makes them searchable.
CREATE TABLE IF NOT EXISTS image_tags (
  image_id      INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  classification TEXT,                   -- top-level: 'ui_screenshot', 'photography', 'non_ui', etc.
  ui_type       TEXT,                    -- 'mobile_app', 'web_app', etc.
  components    TEXT,                    -- JSON array of {type, variant, notes}
  sections      TEXT,                    -- JSON array of strings
  layout        TEXT,                    -- JSON object {pattern, density, hierarchy}
  typography    TEXT,                    -- JSON object {headline:{...}, body:{...}, pairing}
  color_scheme  TEXT,                    -- 'light', 'dark', 'high-contrast', etc.
  effects       TEXT,                    -- JSON array
  use_cases     TEXT,                    -- JSON array
  search_keywords TEXT,                  -- JSON array (free-form, agent-generated)
  notes         TEXT,                    -- freeform agent notes
  confidence    TEXT,                    -- 'high' | 'medium' | 'low'
  raw_json      TEXT NOT NULL            -- full agent response for debugging / reprocessing
);

-- FTS5 virtual table for fast text search across all string-y fields.
CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
  classification,
  ui_type,
  components,
  sections,
  layout,
  typography,
  use_cases,
  search_keywords,
  notes,
  source_alt,
  content=''
);

-- View that returns full image record joined with tags + source for convenience.
CREATE VIEW IF NOT EXISTS v_images AS
SELECT
  i.id, i.path, i.width, i.height, i.format, i.file_size, i.phash,
  i.scanned_at, i.enriched_at, i.enriched_by,
  s.source, s.source_id, s.source_url, s.source_alt,
  t.classification, t.ui_type, t.components, t.sections, t.layout,
  t.typography, t.color_scheme, t.effects, t.use_cases,
  t.search_keywords, t.notes, t.confidence
FROM images i
LEFT JOIN image_source s ON s.image_id = i.id
LEFT JOIN image_tags   t ON t.image_id = i.id;
