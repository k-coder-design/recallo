import type {
  AgentApiState,
  AgentApiUpdate,
  BackupSummary,
  ExportFormat,
  ImportOptions,
  ImportPreview,
  ImportResult,
  OpenedFile,
  SaveResult,
  Card,
  CardBack,
  CardCreateInput,
  CardQuery,
  CardSet,
  CardUpdateInput,
  DuplicateCard,
  EmojiSuggestions,
  Grade,
  GradeResult,
  NextCard,
  NextOptions,
  Result,
  SetCreateInput,
  SetDeletePolicy,
  SetScope,
  SetUpdateInput,
  Space,
  SpaceId,
  StatsOverview,
  NewWordsToday,
  Theme,
  AutoBackupState,
  AnswerCheck,
  TranscriptionSuggestion,
  StudyCounts,
  UndoResult
} from './types'

/** The contract between the interface and the main process. The same domain layer also serves the REST API (MVP-3). */
export interface ApiContract {
  'spaces.list': () => Space[]
  'cards.list': (spaceId: SpaceId, query?: CardQuery) => Card[]
  'cards.get': (id: string) => Card
  'cards.create': (input: CardCreateInput) => Card
  'cards.update': (id: string, input: CardUpdateInput) => Card
  'cards.delete': (id: string) => void
  'cards.findDuplicates': (spaceId: SpaceId, term: string, excludeId?: string) => DuplicateCard[]
  'cards.moveToSet': (cardIds: string[], setId: string | null) => Card[]
  'sets.list': (spaceId: SpaceId) => CardSet[]
  'sets.unsetCount': (spaceId: SpaceId) => number
  'sets.create': (input: SetCreateInput) => CardSet
  'sets.update': (id: string, input: SetUpdateInput) => CardSet
  'sets.delete': (id: string, policy: SetDeletePolicy) => { affectedCards: number }
  'cards.suggestTranscription': (spaceId: SpaceId, term: string) => TranscriptionSuggestion
  'cards.suggestEmojis': (spaceId: SpaceId, term: string, meaning: string) => EmojiSuggestions
  'emoji.search': (query: string) => string[]
  'study.counts': (spaceId: SpaceId, scope?: SetScope) => StudyCounts
  'study.newWordsToday': (spaceId: SpaceId) => NewWordsToday
  'study.setNewPerDay': (spaceId: SpaceId, value: number) => NewWordsToday
  'study.learnMore': (spaceId: SpaceId) => NewWordsToday
  'settings.theme': () => Theme
  'settings.setTheme': (theme: Theme) => Theme
  'backup.autoState': () => AutoBackupState
  'backup.setAuto': (enabled: boolean) => AutoBackupState
  'backup.showFolder': () => void
  'study.next': (spaceId: SpaceId, options?: NextOptions) => NextCard
  'study.reveal': (presentationId: string) => CardBack
  'study.check': (presentationId: string, answer: string) => { back: CardBack; check: AnswerCheck }
  'study.grade': (presentationId: string, grade: Grade) => GradeResult
  'study.undo': (reviewId: string, scope?: SetScope) => UndoResult
  'stats.overview': (spaceId: SpaceId) => StatsOverview
  'settings.agentApi': () => AgentApiState
  'settings.updateAgentApi': (input: AgentApiUpdate) => AgentApiState
  'settings.regenerateToken': () => AgentApiState
  'transfer.openFile': (kind: 'import' | 'backup') => OpenedFile | null
  'transfer.preview': (content: string, options: ImportOptions) => ImportPreview
  'transfer.import': (content: string, options: ImportOptions) => ImportResult
  'transfer.export': (spaceId: SpaceId, scope: SetScope | undefined, format: ExportFormat) => SaveResult
  'transfer.backup': () => SaveResult
  'transfer.inspectBackup': (content: string) => BackupSummary
  'transfer.restore': (content: string) => BackupSummary & { safetyCopy: string }
}

export type ApiMethod = keyof ApiContract

export type ApiHandlers = {
  [M in ApiMethod]: (
    ...args: Parameters<ApiContract[M]>
  ) => ReturnType<ApiContract[M]> | Promise<ReturnType<ApiContract[M]>>
}

export interface BridgeApi {
  invoke<M extends ApiMethod>(
    method: M,
    ...args: Parameters<ApiContract[M]>
  ): Promise<Result<ReturnType<ApiContract[M]>>>
}

export const API_CHANNEL = 'recallo:api'

// Record guarantees that the method list matches the contract.
const METHODS: Record<ApiMethod, true> = {
  'spaces.list': true,
  'cards.list': true,
  'cards.get': true,
  'cards.create': true,
  'cards.update': true,
  'cards.delete': true,
  'cards.findDuplicates': true,
  'cards.moveToSet': true,
  'sets.list': true,
  'sets.unsetCount': true,
  'sets.create': true,
  'sets.update': true,
  'sets.delete': true,
  'cards.suggestTranscription': true,
  'cards.suggestEmojis': true,
  'emoji.search': true,
  'study.counts': true,
  'study.next': true,
  'study.reveal': true,
  'study.check': true,
  'study.grade': true,
  'study.undo': true,
  'study.newWordsToday': true,
  'study.setNewPerDay': true,
  'study.learnMore': true,
  'settings.theme': true,
  'settings.setTheme': true,
  'backup.autoState': true,
  'backup.setAuto': true,
  'backup.showFolder': true,
  'stats.overview': true,
  'settings.agentApi': true,
  'settings.updateAgentApi': true,
  'settings.regenerateToken': true,
  'transfer.openFile': true,
  'transfer.preview': true,
  'transfer.import': true,
  'transfer.export': true,
  'transfer.backup': true,
  'transfer.inspectBackup': true,
  'transfer.restore': true
}

export const API_METHODS = Object.keys(METHODS) as ApiMethod[]

export function isApiMethod(value: unknown): value is ApiMethod {
  return typeof value === 'string' && Object.hasOwn(METHODS, value)
}
