import type { Db } from './database'

/**
 * Schema migrations; the current number is stored in PRAGMA user_version.
 * Card content, memory progress and review history live in separate tables (GEN-06).
 * Only append new items to the end of the array; never change applied migrations.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tts_lang TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  INSERT INTO spaces (id, name, tts_lang, position) VALUES
    ('en', 'English', 'en-US', 0),
    ('es', 'Spanish', 'es-ES', 1);

  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id),
    term TEXT NOT NULL,
    meaning TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX cards_space ON cards(space_id, created_at);

  CREATE TABLE examples (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    translation TEXT,
    mask_fragments TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (card_id, position)
  );

  CREATE TABLE card_progress (
    card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    state INTEGER NOT NULL,
    due TEXT NOT NULL,
    fsrs TEXT NOT NULL
  );
  CREATE INDEX card_progress_due ON card_progress(state, due);

  CREATE TABLE review_log (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    presentation_id TEXT NOT NULL UNIQUE,
    grade TEXT NOT NULL CHECK (grade IN ('remembered', 'forgot')),
    source TEXT NOT NULL CHECK (source IN ('manual', 'voice')),
    reviewed_at TEXT NOT NULL,
    progress_before TEXT NOT NULL,
    progress_after TEXT NOT NULL
  );
  CREATE INDEX review_log_card ON review_log(card_id, reviewed_at);
  `,
  // Meeting mode (D21): a new card is first shown as a word, then as a meaning.
  // introduced_at — when the meeting happened; intro_due — when the new card can be shown again
  // (a repeated meeting or the first recall). A meeting does not change the FSRS state.
  `
  ALTER TABLE card_progress ADD COLUMN introduced_at TEXT;
  ALTER TABLE card_progress ADD COLUMN intro_due TEXT;
  ALTER TABLE review_log ADD COLUMN mode TEXT NOT NULL DEFAULT 'recall' CHECK (mode IN ('intro', 'recall'));
  `,
  // Transcription (D22): IPA without slashes; NULL — not built yet, filled in at startup.
  // Spanish — the Argentine variant, speech too.
  `
  ALTER TABLE cards ADD COLUMN transcription TEXT;
  UPDATE spaces SET tts_lang = 'es-AR' WHERE id = 'es';
  `,
  // Emoji association (D27): emoji NULL — not picked; '' — the user chose "no emoji".
  // emoji_auto = 1 — picked automatically (it can be replaced by a better one, e.g. by AI in MVP-6).
  `
  ALTER TABLE cards ADD COLUMN emoji TEXT;
  ALTER TABLE cards ADD COLUMN emoji_auto INTEGER NOT NULL DEFAULT 1;
  `,
  // MVP-2: sets (SET-01…07) — a card is in one set or in "no set" (set_id NULL);
  // deleting a set keeps its cards without a set by default (ON DELETE SET NULL).
  // Undoing a grade: undone_at marks an undone history record; intro_before stores
  // the meeting state before the record so it can be restored.
  `
  CREATE TABLE sets (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id),
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX sets_space_name ON sets(space_id, name COLLATE NOCASE);
  ALTER TABLE cards ADD COLUMN set_id TEXT REFERENCES sets(id) ON DELETE SET NULL;
  CREATE INDEX cards_set ON cards(set_id);
  ALTER TABLE review_log ADD COLUMN undone_at TEXT;
  ALTER TABLE review_log ADD COLUMN intro_before TEXT;
  `,
  // MVP-3: app settings (key — value) and REST API idempotency keys (API-14):
  // repeating a request with the same key and body returns the saved response instead of running again.
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE idempotency_keys (
    key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    status INTEGER NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  // Second pronunciation (D44): for Spanish — a Castilian transcription next to the Argentine one.
  `
  ALTER TABLE cards ADD COLUMN transcription_alt TEXT;
  `,
  // MVP-8: typed answer mode (D50) — what the user typed, what the app suggested
  // and whether the user changed the grade. Only the final grade (grade) goes to FSRS.
  `
  ALTER TABLE review_log ADD COLUMN typed_answer TEXT;
  ALTER TABLE review_log ADD COLUMN auto_verdict TEXT;
  ALTER TABLE review_log ADD COLUMN overridden INTEGER;
  `
]

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version]
    if (sql === undefined) break
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}
