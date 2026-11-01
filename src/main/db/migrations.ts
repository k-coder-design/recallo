import type { Db } from './database'

/**
 * Миграции схемы, номер текущей хранится в PRAGMA user_version.
 * Содержимое карточек, прогресс памяти и история повторений лежат в разных таблицах (GEN-06).
 * Добавлять только новые элементы в конец массива; применённые миграции не менять.
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
  // Режим знакомства (D21): новая карточка сначала показывается словом, затем значением.
  // introduced_at — когда знакомство пройдено; intro_due — когда новую карточку можно показать снова
  // (повтор знакомства или первое вспоминание). FSRS-состояние знакомство не меняет.
  `
  ALTER TABLE card_progress ADD COLUMN introduced_at TEXT;
  ALTER TABLE card_progress ADD COLUMN intro_due TEXT;
  ALTER TABLE review_log ADD COLUMN mode TEXT NOT NULL DEFAULT 'recall' CHECK (mode IN ('intro', 'recall'));
  `,
  // Транскрипция (D22): IPA без косых черт; NULL — ещё не построена, дозаполняется при запуске.
  // Испанский — аргентинский вариант, озвучка тоже.
  `
  ALTER TABLE cards ADD COLUMN transcription TEXT;
  UPDATE spaces SET tts_lang = 'es-AR' WHERE id = 'es';
  `,
  // Эмодзи-ассоциация (D27): emoji NULL — не подобрано; '' — пользователь выбрал «без эмодзи».
  // emoji_auto = 1 — подобрано автоматически (его можно заменить точнее, например ИИ в MVP-6).
  `
  ALTER TABLE cards ADD COLUMN emoji TEXT;
  ALTER TABLE cards ADD COLUMN emoji_auto INTEGER NOT NULL DEFAULT 1;
  `,
  // MVP-2: наборы (SET-01…07) — карточка в одном наборе или «без набора» (set_id NULL);
  // удаление набора по умолчанию оставляет карточки без набора (ON DELETE SET NULL).
  // Отмена оценки: undone_at помечает отменённую запись истории; intro_before хранит
  // состояние знакомства до записи, чтобы его можно было вернуть.
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
  // MVP-3: настройки приложения (ключ — значение) и ключи идемпотентности REST API (API-14):
  // повтор запроса с тем же ключом и телом возвращает сохранённый ответ, а не выполняется снова.
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
  // Второй вариант произношения (D44): для испанского — кастильская транскрипция рядом с аргентинской.
  `
  ALTER TABLE cards ADD COLUMN transcription_alt TEXT;
  `,
  // MVP-8: режим ввода ответа (D50) — что ввёл пользователь, что предложило приложение
  // и исправил ли пользователь оценку. В FSRS идёт только итоговая оценка (grade).
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
