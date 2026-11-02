export type SpaceId = 'en' | 'es'

export interface Space {
  id: SpaceId
  name: string
  /** Language for speech and (in MVP-5) pronunciation scoring — always the space's language (LANG-06). */
  ttsLang: string
}

export interface Example {
  text: string
  translation: string | null
  /** Explicit example fragments to hide (changed word forms, CARD-09). */
  maskFragments: string[]
}

export type ProgressState = 'new' | 'learning' | 'review' | 'relearning'

export interface CardProgress {
  state: ProgressState
  due: string
  reps: number
  lapses: number
  lastReview: string | null
  /** When the new card's first meeting happened; null — not yet (D21). */
  introducedAt: string | null
}

/** intro — first meeting: word → meaning; recall — recall: meaning → word. */
export type StudyMode = 'intro' | 'recall'

export interface Card {
  id: string
  spaceId: SpaceId
  /** The card's set; null — "no set" (SET-05). */
  setId: string | null
  term: string
  /** IPA without slashes; null — could not be built automatically. */
  transcription: string | null
  /** Second pronunciation (for Spanish — Spain, D44); always null for English. */
  transcriptionAlt: string | null
  /** Emoji association; null — none. */
  emoji: string | null
  /** true — picked automatically, false — chosen by the user. */
  emojiAuto: boolean
  meaning: string
  examples: Example[]
  version: number
  createdAt: string
  updatedAt: string
  progress: CardProgress
}

export interface ExampleInput {
  text: string
  translation?: string | null
  maskFragments?: string[]
}

export interface CardCreateInput {
  spaceId: SpaceId
  setId?: string | null
  term: string
  /** Empty — filled in automatically. */
  transcription?: string | null
  /** Second pronunciation; empty — filled in automatically (Spanish only). */
  transcriptionAlt?: string | null
  /** Not passed — pick automatically; null or an empty string — no emoji. */
  emoji?: string | null
  meaning: string
  examples?: ExampleInput[]
}

export interface CardUpdateInput {
  /** Version the client saw; a mismatch gives CONFLICT (API-15). */
  version: number
  /** Move to another set or to "no set" (null); progress is kept (SET-07). */
  setId?: string | null
  term?: string
  /** Empty — rebuild automatically. Not passed — kept, but rebuilt when the word changes. */
  transcription?: string | null
  /** Same for the second pronunciation. */
  transcriptionAlt?: string | null
  /** Passed — the user's choice (null — no emoji). Not passed — the automatic pick updates when the word or meaning changes. */
  emoji?: string | null
  meaning?: string
  examples?: ExampleInput[]
  /** Explicit progress reset (CARD-05). Without it progress is kept (API-16). */
  resetProgress?: boolean
}

/** Result of an attempt: "Remembered" / "Forgot". */
export type Grade = 'remembered' | 'forgot'

export interface StudyCounts {
  /** Cards ready for recall: due reviews and introduced new cards. */
  due: number
  /** New cards that can be met today, within the daily limit (D48). */
  new: number
  /** New cards in scope beyond today's limit. */
  newWaiting: number
  /** Daily limit of new words for the language. */
  newToday: NewWordsToday
}

/** Today's new-word limit for a language (MVP-7, D48). */
export type { AnswerCheck, AnswerVerdict, DiffPart } from './answerCheck'

/** Automatic backup (MVP-9, D51). */
export interface AutoBackupState {
  enabled: boolean
  lastAt: string | null
  lastError: string | null
  /** Backup folder. */
  folder: string
  /** How many automatic backups are kept right now. */
  count: number
}

/** Appearance theme: system — follows macOS (D49). */
export type Theme = 'system' | 'light' | 'dark'

export interface NewWordsToday {
  /** Words per day from the setting; 0 — reviews only. */
  limit: number
  /** One-off increase for today ("Learn 5 more today"). */
  extra: number
  /** Meetings started today (including postponed "Not yet"). */
  started: number
  /** How many more new words can be started today. */
  remaining: number
}

export interface Segment {
  text: string
  masked: boolean
}

export interface CardFront {
  meaning: string
  emoji: string | null
  /** Examples where hidden fragments have empty text — the original word is not on the front (CARD-10). */
  examples: Segment[][]
}

/** A pronunciation on a card: transcription and the voice language for speech (D44). */
export interface Pronunciation {
  label: string
  flag: string
  lang: string
  transcription: string | null
}

/** Hint for the editor: which transcriptions the app will build. */
export interface TranscriptionSuggestion {
  transcription: string | null
  transcriptionAlt: string | null
}

export interface CardBack {
  term: string
  /** How many times the word was forgotten in recall — for the "clarify the definition" hint (SRS-12). */
  forgotCount: number
  transcription: string | null
  emoji: string | null
  meaning: string
  ttsLang: string
  /** All pronunciations, the primary first (D44). */
  pronunciations: Pronunciation[]
  examples: Array<{ segments: Segment[]; translation: string | null }>
}

export interface NextOptions {
  /** Study scope: all cards of the language, a set, or "no set" (LEARN-01). */
  scope?: SetScope
  /** The last shown card: if there are others, it is not shown twice in a row (SRS-10). */
  avoidCardId?: string
  /** Show the nearest short-interval card without waiting for it to be due (SRS-11). */
  allowEarly?: boolean
  /**
   * The previous card was a first meeting: new cards don't come back to back if there is something to mix in (D56).
   * Without the flag the order is unchanged — so agents and tests can meet all new cards in a row.
   */
  afterNew?: boolean
}

export type NextCard =
  | {
      kind: 'card'
      mode: 'recall'
      presentationId: string
      cardId: string
      front: CardFront
      counts: StudyCounts
    }
  | {
      kind: 'card'
      /** First meeting with a word (D53): all content at once, no self-grading. */
      mode: 'intro'
      presentationId: string
      cardId: string
      back: CardBack
      counts: StudyCounts
    }
  | { kind: 'wait'; nextDueAt: string; counts: StudyCounts }
  | { kind: 'done'; counts: StudyCounts }

export interface GradeResult {
  reviewId: string
  cardId: string
  mode: StudyMode
  grade: Grade
  nextDue: string
  state: ProgressState
  /** true if the grade was already recorded earlier and the repeat did not apply it (LEARN-10). */
  duplicate: boolean
}

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NOT_REVEALED'
  | 'PRESENTATION_EXPIRED'
  | 'INTERNAL'

export interface AppError {
  code: ErrorCode
  message: string
  details?: unknown
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

/** A word's stage for statistics. Learned — review interval of 3 weeks or more; not "learned forever". */
export type WordStage = 'new' | 'introduced' | 'learning' | 'familiar' | 'learned'

export interface DayActivity {
  /** Local date YYYY-MM-DD. */
  date: string
  remembered: number
  forgot: number
  /** Words met ("Got it"). */
  introduced: number
}

export interface HardWord {
  cardId: string
  term: string
  meaning: string
  /** How many times "Forgot" was answered in recall. */
  forgotCount: number
}

export interface StatsOverview {
  total: number
  stages: Record<WordStage, number>
  today: { remembered: number; forgot: number; introduced: number }
  /** Share of "Remembered" among recall answers over 30 days; null — no answers. */
  retention30d: number | null
  /** Consecutive days with study, including today (or up to yesterday if not studied today yet). */
  streakDays: number
  /** How many cards will be ready for recall tomorrow. */
  dueTomorrow: number
  /** The last 14 days, oldest first. */
  activity: DayActivity[]
  hardest: HardWord[]
  swell: Swell
}

export type SwellLabel = 'Flat' | 'Knee-high' | 'Waist-high' | 'Chest-high' | 'Head-high' | 'Overhead'

/** "Today's swell" (D40): wave height in meters — how steadily learning is going. */
export interface Swell {
  height: number
  label: SwellLabel
  /** Days with study in the last windowDays days, including today. */
  activeDays: number
  windowDays: number
  /** Recall accuracy over 14 days; null — fewer than 5 answers so far. */
  accuracy: number | null
  /** Share of words in the Familiar and Learned stages among started ones. */
  mastery: number
  /** What the wave will be after studying today or tomorrow. */
  next: { when: 'today' | 'tomorrow'; height: number }
}

export interface EmojiSuggestions {
  /** What the automatic pick chooses (confident association only); null — nothing. */
  best: string | null
  /** Options to choose manually, best first. */
  options: string[]
}

/** A card set within one language space (SET-01, SET-02). */
export interface CardSet {
  id: string
  spaceId: SpaceId
  name: string
  description: string | null
  version: number
  createdAt: string
  updatedAt: string
  /** How many cards are in the set. */
  cardCount: number
}

export interface SetCreateInput {
  spaceId: SpaceId
  name: string
  description?: string | null
}

export interface SetUpdateInput {
  version: number
  name?: string
  description?: string | null
}

/** What to do with cards when a set is deleted — always chosen explicitly (SET-09, SET-11). */
export type SetDeletePolicy = 'keep-cards' | 'delete-cards'

/** Study scope and list filter: all cards of the language, one set, or "no set". */
export type SetScope = { kind: 'all' } | { kind: 'set'; setId: string } | { kind: 'none' }

export interface CardQuery {
  scope?: SetScope
  /** Search by word, meaning, examples and set name, best matches first (API-02, D54). */
  search?: string
}

export interface DuplicateCard {
  id: string
  term: string
  meaning: string
  setName: string | null
}

/** Undo result: the grade is removed, the card is shown again. */
export interface UndoResult {
  undone: GradeResult
  next: NextCard
}

/** Agent API state — for the Settings screen (MVP-3). */
export interface AgentApiState {
  enabled: boolean
  port: number
  token: string
  status: 'running' | 'stopped' | 'error'
  /** Why it failed to start, e.g. "port in use". */
  error: string | null
  /** API address while it is running. */
  url: string | null
  connection: {
    /** Command for Claude Code (terminal). */
    claudeCode: string
    /** claude_desktop_config.json fragment for Claude Desktop. */
    claudeDesktop: string
    claudeDesktopConfigPath: string
  }
}

export interface AgentApiUpdate {
  enabled?: boolean
  port?: number
}

/** Import formats (MVP-4). */
export type ImportFormat = 'recallo-json' | 'recallo-csv' | 'duocards' | 'quizlet'

/** Where to put imported cards. */
export type ImportDestination =
  | { kind: 'file-sets' }
  | { kind: 'set'; setId: string }
  | { kind: 'new-set'; name: string }
  | { kind: 'none' }

export interface ImportOptions {
  spaceId: SpaceId
  /** Not set — detected from the file content. */
  format?: ImportFormat
  /** Swap word and meaning (for Quizlet and two-column files). */
  swap?: boolean
  destination: ImportDestination
  /** Also add words that already exist (skipped by default). */
  includeDuplicates?: boolean
}

export interface ImportRow {
  index: number
  term: string
  meaning: string
  examples: number
  set: string | null
  status: 'new' | 'duplicate' | 'error' | 'created' | 'skipped'
  message?: string
}

export interface ImportPreview {
  format: ImportFormat
  /** The file has its own sets (Recallo formats). */
  hasSets: boolean
  rows: ImportRow[]
  summary: { new: number; duplicates: number; errors: number }
}

export interface ImportResult {
  rows: ImportRow[]
  summary: { created: number; skipped: number; errors: number }
}

export type ExportFormat = 'csv' | 'json'

export interface OpenedFile {
  name: string
  content: string
}

export interface SaveResult {
  saved: boolean
  path: string | null
}

export interface BackupSummary {
  exportedAt: string
  cards: number
  sets: number
  reviews: number
}
