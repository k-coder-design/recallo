export type SpaceId = 'en' | 'es'

export interface Space {
  id: SpaceId
  name: string
  /** Язык озвучивания и (в MVP-5) оценки произношения — всегда язык пространства (LANG-06). */
  ttsLang: string
}

export interface Example {
  text: string
  translation: string | null
  /** Явно заданные фрагменты примера, которые нужно скрыть (изменённые формы, CARD-09). */
  maskFragments: string[]
}

export type ProgressState = 'new' | 'learning' | 'review' | 'relearning'

export interface CardProgress {
  state: ProgressState
  due: string
  reps: number
  lapses: number
  lastReview: string | null
  /** Когда пройдено знакомство с новой карточкой; null — ещё не пройдено (D21). */
  introducedAt: string | null
}

/** intro — знакомство: слово → значение; recall — вспоминание: значение → слово. */
export type StudyMode = 'intro' | 'recall'

export interface Card {
  id: string
  spaceId: SpaceId
  /** Набор карточки; null — «без набора» (SET-05). */
  setId: string | null
  term: string
  /** IPA без косых черт; null — построить автоматически не удалось. */
  transcription: string | null
  /** Второй вариант произношения (для испанского — Испания, D44); у английского всегда null. */
  transcriptionAlt: string | null
  /** Эмодзи-ассоциация; null — нет. */
  emoji: string | null
  /** true — подобрано автоматически, false — выбрано пользователем. */
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
  /** Пусто — заполнится автоматически. */
  transcription?: string | null
  /** Второй вариант произношения; пусто — заполнится автоматически (только для испанского). */
  transcriptionAlt?: string | null
  /** Не передано — подобрать автоматически; null или пустая строка — без эмодзи. */
  emoji?: string | null
  meaning: string
  examples?: ExampleInput[]
}

export interface CardUpdateInput {
  /** Версия, которую видел клиент; несовпадение даёт CONFLICT (API-15). */
  version: number
  /** Перенос в другой набор или «без набора» (null); прогресс сохраняется (SET-07). */
  setId?: string | null
  term?: string
  /** Пусто — построить заново автоматически. Не передано — сохранится, но при смене слова построится заново. */
  transcription?: string | null
  /** То же для второго варианта произношения. */
  transcriptionAlt?: string | null
  /** Передано — выбор пользователя (null — без эмодзи). Не передано — автоподбор обновится при смене слова или значения. */
  emoji?: string | null
  meaning?: string
  examples?: ExampleInput[]
  /** Явный сброс прогресса (CARD-05). Без него прогресс сохраняется (API-16). */
  resetProgress?: boolean
}

/** Результат попытки: «Вспомнил» / «Не вспомнил». */
export type Grade = 'remembered' | 'forgot'

export interface StudyCounts {
  /** Карточки, готовые к вспоминанию: наступившие повторения и знакомые новые. */
  due: number
  /** Новые карточки, с которыми можно познакомиться сегодня — с учётом дневного лимита (D48). */
  new: number
  /** Новые карточки области сверх сегодняшнего лимита. */
  newWaiting: number
  /** Дневной лимит новых слов языка. */
  newToday: NewWordsToday
}

/** Лимит новых слов на сегодня для языка (MVP-7, D48). */
export type { AnswerCheck, AnswerVerdict, DiffPart } from './answerCheck'

/** Автоматическая резервная копия (MVP-9, D51). */
export interface AutoBackupState {
  enabled: boolean
  lastAt: string | null
  lastError: string | null
  /** Папка с копиями. */
  folder: string
  /** Сколько автокопий сейчас хранится. */
  count: number
}

/** Тема оформления: system — как в macOS (D49). */
export type Theme = 'system' | 'light' | 'dark'

export interface NewWordsToday {
  /** Слов в день по настройке; 0 — только повторения. */
  limit: number
  /** Разовое увеличение на сегодня («Learn 5 more today»). */
  extra: number
  /** Знакомства, начатые сегодня (включая отложенные «Not yet»). */
  started: number
  /** Сколько ещё новых слов можно начать сегодня. */
  remaining: number
}

export interface Segment {
  text: string
  masked: boolean
}

export interface CardFront {
  meaning: string
  emoji: string | null
  /** Примеры, где скрытые фрагменты имеют пустой text — исходного слова на лицевой стороне нет (CARD-10). */
  examples: Segment[][]
}

/** Вариант произношения на карточке: транскрипция и язык голоса для озвучки (D44). */
export interface Pronunciation {
  label: string
  flag: string
  lang: string
  transcription: string | null
}

/** Подсказка редактору: какие транскрипции построит приложение. */
export interface TranscriptionSuggestion {
  transcription: string | null
  transcriptionAlt: string | null
}

export interface CardBack {
  term: string
  /** Сколько раз слово забывали при вспоминании — для подсказки уточнить определение (SRS-12). */
  forgotCount: number
  transcription: string | null
  emoji: string | null
  meaning: string
  ttsLang: string
  /** Все варианты произношения, основной первым (D44). */
  pronunciations: Pronunciation[]
  examples: Array<{ segments: Segment[]; translation: string | null }>
}

export interface NextOptions {
  /** Область обучения: все карточки языка, набор или «без набора» (LEARN-01). */
  scope?: SetScope
  /** Последняя показанная карточка: при наличии других она не показывается подряд (SRS-10). */
  avoidCardId?: string
  /** Показать ближайшую карточку из короткого повторения, не дожидаясь её срока (SRS-11). */
  allowEarly?: boolean
  /**
   * Предыдущая карточка была знакомством: новые не идут подряд, если есть чем их перемежать (D56).
   * Без флага порядок прежний — так агенты и тесты могут знакомиться со всеми новыми подряд.
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
      /** Первая встреча со словом (D53): всё содержимое сразу, без самооценки. */
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
  /** true, если оценка уже была записана раньше и повтор её не применил (LEARN-10). */
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

/** Стадия слова для статистики. Learned — интервал повторения от 3 недель; это не «выучено навсегда». */
export type WordStage = 'new' | 'introduced' | 'learning' | 'familiar' | 'learned'

export interface DayActivity {
  /** Локальная дата YYYY-MM-DD. */
  date: string
  remembered: number
  forgot: number
  /** Слова, с которыми познакомились («Got it»). */
  introduced: number
}

export interface HardWord {
  cardId: string
  term: string
  meaning: string
  /** Сколько раз ответили «Forgot» при вспоминании. */
  forgotCount: number
}

export interface StatsOverview {
  total: number
  stages: Record<WordStage, number>
  today: { remembered: number; forgot: number; introduced: number }
  /** Доля «Remembered» среди ответов вспоминания за 30 дней; null — ответов не было. */
  retention30d: number | null
  /** Дней подряд с занятиями, включая сегодня (или до вчера, если сегодня ещё не занимались). */
  streakDays: number
  /** Сколько карточек станет готово к вспоминанию завтра. */
  dueTomorrow: number
  /** Последние 14 дней, от старых к новым. */
  activity: DayActivity[]
  hardest: HardWord[]
  swell: Swell
}

export type SwellLabel = 'Flat' | 'Knee-high' | 'Waist-high' | 'Chest-high' | 'Head-high' | 'Overhead'

/** «Today's swell» (D40): высота волны в метрах — насколько стабильно идёт обучение. */
export interface Swell {
  height: number
  label: SwellLabel
  /** Дни с занятиями за последние windowDays дней, включая сегодня. */
  activeDays: number
  windowDays: number
  /** Точность вспоминания за 14 дней; null — пока меньше 5 ответов. */
  accuracy: number | null
  /** Доля слов на стадиях Familiar и Learned среди начатых. */
  mastery: number
  /** Какой станет волна после занятия сегодня или завтра. */
  next: { when: 'today' | 'tomorrow'; height: number }
}

export interface EmojiSuggestions {
  /** Что выберет автоподбор (только уверенная ассоциация); null — ничего. */
  best: string | null
  /** Варианты для выбора вручную, лучший первым. */
  options: string[]
}

/** Набор карточек одного языкового пространства (SET-01, SET-02). */
export interface CardSet {
  id: string
  spaceId: SpaceId
  name: string
  description: string | null
  version: number
  createdAt: string
  updatedAt: string
  /** Сколько карточек в наборе. */
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

/** Что делать с карточками при удалении набора — задаётся всегда явно (SET-09, SET-11). */
export type SetDeletePolicy = 'keep-cards' | 'delete-cards'

/** Область обучения и фильтр списка: все карточки языка, один набор или «без набора». */
export type SetScope = { kind: 'all' } | { kind: 'set'; setId: string } | { kind: 'none' }

export interface CardQuery {
  scope?: SetScope
  /** Поиск по слову, значению, примерам и названию набора, лучшие совпадения первыми (API-02, D54). */
  search?: string
}

export interface DuplicateCard {
  id: string
  term: string
  meaning: string
  setName: string | null
}

/** Результат отмены: оценка снята, карточка показывается снова. */
export interface UndoResult {
  undone: GradeResult
  next: NextCard
}

/** Состояние API для агентов — для экрана Settings (MVP-3). */
export interface AgentApiState {
  enabled: boolean
  port: number
  token: string
  status: 'running' | 'stopped' | 'error'
  /** Причина ошибки запуска, например «порт занят». */
  error: string | null
  /** Адрес API, пока он работает. */
  url: string | null
  connection: {
    /** Команда для Claude Code (терминал). */
    claudeCode: string
    /** Фрагмент claude_desktop_config.json для Claude Desktop. */
    claudeDesktop: string
    claudeDesktopConfigPath: string
  }
}

export interface AgentApiUpdate {
  enabled?: boolean
  port?: number
}

/** Форматы импорта (MVP-4). */
export type ImportFormat = 'recallo-json' | 'recallo-csv' | 'duocards' | 'quizlet'

/** Куда класть импортированные карточки. */
export type ImportDestination =
  | { kind: 'file-sets' }
  | { kind: 'set'; setId: string }
  | { kind: 'new-set'; name: string }
  | { kind: 'none' }

export interface ImportOptions {
  spaceId: SpaceId
  /** Не задан — определяется по содержимому файла. */
  format?: ImportFormat
  /** Поменять местами слово и значение (для Quizlet и двухколоночных файлов). */
  swap?: boolean
  destination: ImportDestination
  /** Добавлять и слова, которые уже есть (по умолчанию пропускаются). */
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
  /** В файле есть свои наборы (форматы Recallo). */
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
