import { State } from 'ts-fsrs'
import { z } from 'zod'
import type { Db } from '../db/database'
import type { NewWordsToday, SpaceId } from '../../shared/types'
import type { Clock } from './scheduler'
import { localDate, startOfLocalDay } from './stats'
import { spaceIdSchema } from './validation'

/** Сколько новых слов в день по умолчанию (D48). */
export const DEFAULT_NEW_PER_DAY = 10
/** «Learn 5 more today»: на сколько разово увеличивается лимит сегодня. */
export const EXTRA_NEW_STEP = 5
export const MAX_NEW_PER_DAY = 500

const newPerDaySchema = z
  .number({ error: 'Enter a number' })
  .int('Enter a whole number')
  .min(0, 'Use a number from 0 to 500')
  .max(MAX_NEW_PER_DAY, 'Use a number from 0 to 500')

/**
 * Лимит новых слов в день (MVP-7, D48). Ограничивает только начало знакомства: повторения не ограничены.
 * Считаются знакомства за сегодня по местному времени и слова, знакомство с которыми начато, но отложено
 * («Not yet»), — они уже показаны и не должны пропадать посреди знакомства. Хранится в таблице settings.
 */
export class StudyLimits {
  constructor(
    private readonly db: Db,
    private readonly now: Clock
  ) {}

  private read(key: string): string | undefined {
    return this.db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) as string | undefined
  }

  private write(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, value)
  }

  newPerDay(spaceId: SpaceId): number {
    const stored = Number(this.read(`study.newPerDay.${spaceIdSchema.parse(spaceId)}`))
    return Number.isInteger(stored) && stored >= 0 ? stored : DEFAULT_NEW_PER_DAY
  }

  setNewPerDay(spaceId: SpaceId, value: unknown): NewWordsToday {
    const id = spaceIdSchema.parse(spaceId)
    this.write(`study.newPerDay.${id}`, String(newPerDaySchema.parse(value)))
    return this.today(id)
  }

  /** Разовое увеличение действует только в тот день, когда его попросили. */
  private extraToday(spaceId: SpaceId): number {
    const raw = this.read(`study.extraNew.${spaceId}`)
    if (!raw) return 0
    const { date, extra } = JSON.parse(raw) as { date: string; extra: number }
    return date === localDate(this.now()) ? extra : 0
  }

  learnMore(spaceId: SpaceId): NewWordsToday {
    const id = spaceIdSchema.parse(spaceId)
    const extra = this.extraToday(id) + EXTRA_NEW_STEP
    this.write(`study.extraNew.${id}`, JSON.stringify({ date: localDate(this.now()), extra }))
    return this.today(id)
  }

  today(spaceId: SpaceId): NewWordsToday {
    const id = spaceIdSchema.parse(spaceId)
    const limit = this.newPerDay(id)
    const extra = this.extraToday(id)
    const started = this.db
      .prepare(
        `SELECT COUNT(*) FROM cards c JOIN card_progress p ON p.card_id = c.id
         WHERE c.space_id = ? AND (
           p.introduced_at >= ? OR
           (p.state = ${State.New} AND p.introduced_at IS NULL AND p.intro_due IS NOT NULL)
         )`
      )
      .pluck()
      .get(id, startOfLocalDay(this.now()).toISOString()) as number
    return { limit, extra, started, remaining: Math.max(0, limit + extra - started) }
  }
}
