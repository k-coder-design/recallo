import { State } from 'ts-fsrs'
import { z } from 'zod'
import type { Db } from '../db/database'
import type { NewWordsToday, SpaceId } from '../../shared/types'
import type { Clock } from './scheduler'
import { localDate, startOfLocalDay } from './stats'
import { spaceIdSchema } from './validation'

/** Default number of new words per day (D48). */
export const DEFAULT_NEW_PER_DAY = 10
/** "Learn 5 more today": how much today's limit is raised once. */
export const EXTRA_NEW_STEP = 5
export const MAX_NEW_PER_DAY = 500

const newPerDaySchema = z
  .number({ error: 'Enter a number' })
  .int('Enter a whole number')
  .min(0, 'Use a number from 0 to 500')
  .max(MAX_NEW_PER_DAY, 'Use a number from 0 to 500')

/**
 * Daily new-word limit (MVP-7, D48). It limits only starting a meeting: reviews are unlimited.
 * Counted are today's meetings in local time and words whose meeting started but was postponed
 * ("Not yet") — they were already shown and must not disappear mid-meeting. Stored in the settings table.
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

  /** A one-off increase applies only on the day it was asked for. */
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
