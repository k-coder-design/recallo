import type { Db } from './db/database'
import type { ApiHandlers } from '../shared/api'
import type { AutoBackupState, Theme } from '../shared/types'
import { CardService } from './domain/cards'
import { Scheduler, type Clock, type SchedulerOptions } from './domain/scheduler'
import { SetService } from './domain/sets'
import { StudyService } from './domain/study'
import { StudyLimits } from './domain/limits'
import { StatsService } from './domain/stats'
import { TransferService } from './domain/transfer'
import { searchEmojis } from './emoji'
import type { AgentApiController } from './agentApi'
import type { FileTransfer } from './fileTransfer'

export interface Services {
  cards: CardService
  sets: SetService
  study: StudyService
  limits: StudyLimits
  stats: StatsService
  transfer: TransferService
}

export function createServices(db: Db, options: { now?: Clock; scheduler?: SchedulerOptions } = {}): Services {
  const now = options.now ?? (() => new Date())
  const scheduler = new Scheduler(options.scheduler)
  const sets = new SetService(db, now)
  const cards = new CardService(db, scheduler, sets, now)
  const limits = new StudyLimits(db, now)
  const study = new StudyService(db, cards, scheduler, limits, now)
  const stats = new StatsService(db, now)
  const transfer = new TransferService(db, cards, sets, now)
  return { cards, sets, study, limits, stats, transfer }
}

/** Тема оформления: чтение и смена с немедленным применением к окну (D49). */
export interface Appearance {
  theme: () => Theme
  setTheme: (theme: unknown) => Theme
}

/** API для агентов: на Mac — AgentApiController, на телефоне — заглушка «выключено» (D57). */
export type AgentApi = Pick<AgentApiController, 'state' | 'update' | 'regenerateToken'>

/** Файлы импорта, экспорта и полной копии: на Mac — диалоги macOS, на телефоне — своя реализация (D57). */
export type Files = Pick<FileTransfer, 'open' | 'exportDictionary' | 'backup' | 'restore'>

/** Автокопия для Settings: состояние, переключатель и папка в Finder (D51). */
export interface Backups {
  state: () => Promise<AutoBackupState>
  setEnabled: (enabled: unknown) => Promise<AutoBackupState>
  showFolder: () => void
}

export function createHandlers(
  { cards, sets, study, limits, stats, transfer }: Services,
  agentApi: AgentApi,
  files: Files,
  appearance: Appearance,
  backups: Backups
): ApiHandlers {
  return {
    'spaces.list': () => cards.listSpaces(),
    'cards.list': (spaceId, query) => cards.list(spaceId, query),
    'cards.get': (id) => cards.get(id),
    'cards.create': (input) => cards.create(input),
    'cards.update': (id, input) => cards.update(id, input),
    'cards.delete': (id) => cards.delete(id),
    'cards.findDuplicates': (spaceId, term, excludeId) => cards.findDuplicates(spaceId, term, excludeId),
    'cards.moveToSet': (cardIds, setId) => cards.moveToSet(cardIds, setId),
    'sets.list': (spaceId) => sets.list(spaceId),
    'sets.unsetCount': (spaceId) => sets.unsetCount(spaceId),
    'sets.create': (input) => sets.create(input),
    'sets.update': (id, input) => sets.update(id, input),
    'sets.delete': (id, policy) => sets.delete(id, policy),
    'cards.suggestTranscription': (spaceId, term) => cards.suggestTranscription(spaceId, term),
    'cards.suggestEmojis': (spaceId, term, meaning) => cards.suggestEmojis(spaceId, term, meaning),
    'emoji.search': (query) => searchEmojis(query),
    'study.counts': (spaceId, scope) => study.counts(spaceId, scope),
    'study.next': (spaceId, options) => study.next(spaceId, options),
    'study.reveal': (presentationId) => study.reveal(presentationId),
    'study.check': (presentationId, answer) => study.check(presentationId, answer),
    'study.grade': (presentationId, grade) => study.grade(presentationId, grade),
    'study.undo': (reviewId, scope) => study.undo(reviewId, scope),
    'study.newWordsToday': (spaceId) => limits.today(spaceId),
    'study.setNewPerDay': (spaceId, value) => limits.setNewPerDay(spaceId, value),
    'study.learnMore': (spaceId) => limits.learnMore(spaceId),
    'stats.overview': (spaceId) => stats.overview(spaceId),
    'settings.agentApi': () => agentApi.state(),
    'settings.updateAgentApi': (input) => agentApi.update(input),
    'settings.regenerateToken': () => agentApi.regenerateToken(),
    'settings.theme': () => appearance.theme(),
    'settings.setTheme': (theme) => appearance.setTheme(theme),
    'backup.autoState': () => backups.state(),
    'backup.setAuto': (enabled) => backups.setEnabled(enabled),
    'backup.showFolder': () => backups.showFolder(),
    'transfer.openFile': (kind) => files.open(kind),
    'transfer.preview': (content, options) => transfer.preview(content, options),
    'transfer.import': (content, options) => transfer.import(content, options),
    'transfer.export': (spaceId, scope, format) => files.exportDictionary(spaceId, scope, format),
    'transfer.backup': () => files.backup(),
    'transfer.inspectBackup': (content) => transfer.inspectBackup(content),
    'transfer.restore': (content) => files.restore(content)
  }
}
