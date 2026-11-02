import type { Db } from '../db/database'
import type {
  BackupSummary,
  ExportFormat,
  ImportOptions,
  ImportPreview,
  ImportResult,
  ImportRow,
  SetScope,
  SpaceId
} from '../../shared/types'
import { detectFormat, parseImport, toRecalloCsv, toRecalloJson, type ParsedCard } from '../import/formats'
import type { CardService } from './cards'
import { termKeys } from './duplicates'
import { DomainError, toAppError } from './errors'
import type { Clock } from './scheduler'
import type { SetService } from './sets'
import { scopeSchema, spaceIdSchema } from './validation'

/** Full-backup tables in insertion order (referenced ones first). Settings and the token are not included. */
const BACKUP_TABLES = ['sets', 'cards', 'examples', 'card_progress', 'review_log'] as const

interface Evaluated {
  card: ParsedCard
  row: ImportRow
}

/**
 * Dictionary import and export (MVP-4): Recallo CSV/JSON, DuoCards and Quizlet exports as input;
 * a full backup with progress and history — for backing up and moving.
 */
export class TransferService {
  constructor(
    private readonly db: Db,
    private readonly cards: CardService,
    private readonly sets: SetService,
    private readonly now: Clock
  ) {}

  /** Preview: what will be added, what is skipped as a duplicate and where the errors are — before changing data. */
  preview(content: string, options: ImportOptions): ImportPreview {
    const { format, evaluated } = this.evaluate(content, options)
    const count = (status: ImportRow['status']) => evaluated.filter((e) => e.row.status === status).length
    return {
      format,
      hasSets: evaluated.some((e) => e.card.set !== null),
      rows: evaluated.map((e) => e.row),
      summary: { new: count('new'), duplicates: count('duplicate'), errors: count('error') }
    }
  }

  /** Import: creates new cards, skips duplicates (unless asked otherwise), does not hide errors. */
  import(content: string, options: ImportOptions): ImportResult {
    const { evaluated } = this.evaluate(content, options)
    const spaceId = spaceIdSchema.parse(options.spaceId)
    const setIds = new Map<string, string>()
    const setFor = (card: ParsedCard): string | null => {
      const destination = options.destination
      if (destination.kind === 'none') return null
      if (destination.kind === 'set') return this.sets.requireInSpace(destination.setId, spaceId).id
      const name = destination.kind === 'new-set' ? destination.name.trim() : card.set
      if (!name) return null
      const key = name.toLowerCase()
      if (!setIds.has(key)) {
        const existing = this.sets.list(spaceId).find((s) => s.name.toLowerCase() === key)
        setIds.set(key, existing?.id ?? this.sets.create({ spaceId, name }).id)
      }
      return setIds.get(key) as string
    }

    const rows = this.db.transaction(() =>
      evaluated.map(({ card, row }): ImportRow => {
        if (row.status === 'error') return row
        if (row.status === 'duplicate') return { ...row, status: 'skipped' }
        try {
          this.cards.create({
            spaceId,
            setId: setFor(card),
            term: card.term,
            meaning: card.meaning,
            examples: card.examples,
            ...(card.transcription ? { transcription: card.transcription } : {}),
            ...(card.transcriptionAlt ? { transcriptionAlt: card.transcriptionAlt } : {}),
            ...(card.emoji ? { emoji: card.emoji } : {})
          })
          return { ...row, status: 'created' }
        } catch (error) {
          return { ...row, status: 'error', message: toAppError(error).message }
        }
      })
    )()

    const count = (status: ImportRow['status']) => rows.filter((r) => r.status === status).length
    return { rows, summary: { created: count('created'), skipped: count('skipped'), errors: count('error') } }
  }

  private evaluate(content: string, options: ImportOptions): { format: ImportPreview['format']; evaluated: Evaluated[] } {
    const spaceId = spaceIdSchema.parse(options.spaceId)
    const format = options.format ?? detectFormat(content)
    const parsed = parseImport(content, format, options.swap ?? false)
    if (parsed.length === 0) throw new DomainError('VALIDATION', 'No cards found in the file')

    const seen = new Set<string>()
    const evaluated = parsed.map((card, index): Evaluated => {
      const base = { index, term: card.term, meaning: card.meaning, examples: card.examples.length, set: card.set }
      if (!card.term) return { card, row: { ...base, status: 'error', message: 'No word or phrase' } }
      if (!card.meaning) return { card, row: { ...base, status: 'error', message: 'No meaning' } }

      const keys = termKeys(card.term)
      const inFile = keys.some((k) => seen.has(k))
      keys.forEach((k) => seen.add(k))
      if (!options.includeDuplicates) {
        if (inFile) return { card, row: { ...base, status: 'duplicate', message: 'Repeated in this file' } }
        const existing = this.cards.findDuplicates(spaceId, card.term)
        if (existing.length > 0) {
          return { card, row: { ...base, status: 'duplicate', message: `Already exists: ${existing.map((e) => e.term).join(', ')}` } }
        }
      }
      return { card, row: { ...base, status: 'new' } }
    })
    return { format, evaluated }
  }

  /** A language or set dictionary in CSV/JSON — for moving and sharing (without progress). */
  exportDictionary(spaceId: SpaceId, scope: SetScope | undefined, format: ExportFormat): { filename: string; content: string } {
    const id = spaceIdSchema.parse(spaceId)
    const parsedScope = scopeSchema.parse(scope)
    const cards = this.cards.list(id, { scope: parsedScope }).reverse()
    const sets = this.sets.list(id)
    const scopeName =
      parsedScope.kind === 'set' ? (sets.find((s) => s.id === parsedScope.setId)?.name ?? 'set') : parsedScope.kind === 'none' ? 'no-set' : 'all'
    const date = this.now().toISOString().slice(0, 10)
    const base = `Recallo ${id === 'en' ? 'English' : 'Spanish'} ${scopeName} ${date}`.replace(/[\\/:*?"<>|]/g, '-')
    return format === 'csv'
      ? { filename: `${base}.csv`, content: toRecalloCsv(cards, sets) }
      : { filename: `${base}.json`, content: toRecalloJson(id, cards, sets, this.now().toISOString()) }
  }

  /** A full backup: sets, cards, examples, progress and answer history. */
  backup(): { filename: string; content: string } {
    const data = Object.fromEntries(BACKUP_TABLES.map((table) => [table, this.db.prepare(`SELECT * FROM ${table}`).all()]))
    const exportedAt = this.now().toISOString()
    const content = JSON.stringify(
      { format: 'recallo-backup', version: 1, schemaVersion: this.db.pragma('user_version', { simple: true }), exportedAt, data },
      null,
      1
    )
    return { filename: `Recallo backup ${exportedAt.slice(0, 10)}.json`, content: `${content}\n` }
  }

  /** What is inside a backup — for the confirmation before restoring. */
  inspectBackup(content: string): BackupSummary {
    const backup = this.parseBackup(content)
    return {
      exportedAt: backup.exportedAt,
      cards: backup.data['cards']?.length ?? 0,
      sets: backup.data['sets']?.length ?? 0,
      reviews: backup.data['review_log']?.length ?? 0
    }
  }

  /**
   * Restore: replaces all sets, cards, progress and history with the backup data.
   * Before calling, the current database must be saved (the main process does that).
   */
  restore(content: string): BackupSummary {
    const backup = this.parseBackup(content)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM cards').run()
      this.db.prepare('DELETE FROM sets').run()
      for (const table of BACKUP_TABLES) {
        // A backup from an older version: take only existing columns; new ones get default values.
        const columns = new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name))
        for (const row of backup.data[table] ?? []) {
          const keys = Object.keys(row).filter((k) => columns.has(k))
          if (keys.length === 0) continue
          this.db
            .prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`)
            .run(Object.fromEntries(keys.map((k) => [k, row[k]])))
        }
      }
    })()
    return this.inspectBackup(content)
  }

  private parseBackup(content: string): { exportedAt: string; data: Record<string, Array<Record<string, unknown>>> } {
    let backup: { format?: string; schemaVersion?: number; exportedAt?: string; data?: Record<string, Array<Record<string, unknown>>> }
    try {
      backup = JSON.parse(content)
    } catch {
      throw new DomainError('VALIDATION', 'The backup file is not valid JSON')
    }
    if (backup.format !== 'recallo-backup' || !backup.data) {
      throw new DomainError('VALIDATION', 'This is not a Recallo backup. To add words from a file, use Import in Cards.')
    }
    const current = this.db.pragma('user_version', { simple: true }) as number
    if ((backup.schemaVersion ?? 0) > current) {
      throw new DomainError('VALIDATION', 'This backup was made by a newer version of Recallo. Update the app first.')
    }
    return { exportedAt: backup.exportedAt ?? '', data: backup.data }
  }
}
