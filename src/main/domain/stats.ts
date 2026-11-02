import { State } from 'ts-fsrs'
import type { Db } from '../db/database'
import type { DayActivity, HardWord, SpaceId, StatsOverview, WordStage } from '../../shared/types'
import { parseProgress, type Clock } from './scheduler'
import { computeSwell, SWELL_WINDOW_DAYS } from './swell'
import { spaceIdSchema } from './validation'

const DAY_MS = 24 * 60 * 60 * 1000
/** From what review interval a word counts as Learned (like "mature" in Anki). */
export const LEARNED_INTERVAL_DAYS = 21
const ACTIVITY_DAYS = 14
const HARDEST_LIMIT = 10

/** Local date YYYY-MM-DD: days are counted by the user's clock, not UTC. */
export function localDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfLocalDay(date: Date, offsetDays = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays)
}

interface ProgressRow {
  fsrs: string
  introduced_at: string | null
}

interface LogRow {
  mode: 'intro' | 'recall'
  grade: 'remembered' | 'forgot'
  reviewed_at: string
}

export class StatsService {
  constructor(
    private readonly db: Db,
    private readonly now: Clock
  ) {}

  overview(spaceId: SpaceId): StatsOverview {
    const id = spaceIdSchema.parse(spaceId)
    const now = this.now()
    const progress = this.db
      .prepare(
        `SELECT p.fsrs, p.introduced_at FROM cards c JOIN card_progress p ON p.card_id = c.id WHERE c.space_id = ?`
      )
      .all(id) as ProgressRow[]

    const stages: Record<WordStage, number> = { new: 0, introduced: 0, learning: 0, familiar: 0, learned: 0 }
    const tomorrowStart = startOfLocalDay(now, 1).getTime()
    const tomorrowEnd = startOfLocalDay(now, 2).getTime()
    let dueTomorrow = 0
    for (const row of progress) {
      const card = parseProgress(row.fsrs)
      stages[this.stage(card.state, card.due, card.last_review, row.introduced_at)]++
      const due = card.due.getTime()
      if (card.state !== State.New && due >= tomorrowStart && due < tomorrowEnd) dueTomorrow++
    }

    const logs = this.db
      .prepare(
        `SELECT r.mode, r.grade, r.reviewed_at FROM review_log r JOIN cards c ON c.id = r.card_id
         WHERE c.space_id = ? AND r.undone_at IS NULL ORDER BY r.reviewed_at`
      )
      .all(id) as LogRow[]

    return {
      total: progress.length,
      stages,
      ...this.activity(logs, now),
      dueTomorrow,
      hardest: this.hardest(id),
      swell: this.swell(logs, stages, now)
    }
  }

  private stage(state: State, due: Date, lastReview: Date | undefined, introducedAt: string | null): WordStage {
    if (state === State.New) return introducedAt ? 'introduced' : 'new'
    if (state !== State.Review) return 'learning'
    const intervalDays = lastReview ? (due.getTime() - lastReview.getTime()) / DAY_MS : 0
    return intervalDays >= LEARNED_INTERVAL_DAYS ? 'learned' : 'familiar'
  }

  private activity(
    logs: LogRow[],
    now: Date
  ): Pick<StatsOverview, 'today' | 'retention30d' | 'streakDays' | 'activity'> {
    const days = new Map<string, DayActivity>()
    for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset--) {
      const date = localDate(startOfLocalDay(now, -offset))
      days.set(date, { date, remembered: 0, forgot: 0, introduced: 0 })
    }

    const activeDays = new Set<string>()
    const retentionFrom = now.getTime() - 30 * DAY_MS
    let recentRemembered = 0
    let recentRecall = 0

    for (const log of logs) {
      const reviewedAt = new Date(log.reviewed_at)
      const date = localDate(reviewedAt)
      activeDays.add(date)
      const day = days.get(date)
      if (log.mode === 'intro') {
        if (day && log.grade === 'remembered') day.introduced++
        continue
      }
      if (day) day[log.grade]++
      if (reviewedAt.getTime() >= retentionFrom) {
        recentRecall++
        if (log.grade === 'remembered') recentRemembered++
      }
    }

    // Streak: if there was no study today yet, it does not break until the day ends.
    let streakDays = 0
    let offset = activeDays.has(localDate(now)) ? 0 : -1
    while (activeDays.has(localDate(startOfLocalDay(now, offset)))) {
      streakDays++
      offset--
    }

    const today = days.get(localDate(now)) as DayActivity
    return {
      today: { remembered: today.remembered, forgot: today.forgot, introduced: today.introduced },
      retention30d: recentRecall > 0 ? recentRemembered / recentRecall : null,
      streakDays,
      activity: [...days.values()]
    }
  }

  private swell(logs: LogRow[], stages: Record<WordStage, number>, now: Date) {
    const activeDays = new Set(logs.map((log) => localDate(new Date(log.reviewed_at))))
    const inWindow = (from: number, to: number) => {
      let count = 0
      for (let offset = from; offset <= to; offset++) if (activeDays.has(localDate(startOfLocalDay(now, offset)))) count++
      return count
    }
    const recallFrom = startOfLocalDay(now, -(ACTIVITY_DAYS - 1)).getTime()
    const recalls = logs.filter((log) => log.mode === 'recall' && new Date(log.reviewed_at).getTime() >= recallFrom)
    return computeSwell({
      activeDays: inWindow(-(SWELL_WINDOW_DAYS - 1), 0),
      activeToday: activeDays.has(localDate(now)),
      activeDaysKeptTomorrow: inWindow(-(SWELL_WINDOW_DAYS - 2), 0),
      recalls: recalls.length,
      remembered: recalls.filter((log) => log.grade === 'remembered').length,
      started: stages.introduced + stages.learning + stages.familiar + stages.learned,
      mastered: stages.familiar + stages.learned
    })
  }

  /** Often forgotten words: candidates for a clearer definition or example (SRS-12). */
  private hardest(spaceId: SpaceId): HardWord[] {
    return this.db
      .prepare(
        `SELECT c.id AS cardId, c.term, c.meaning, COUNT(*) AS forgotCount
         FROM review_log r JOIN cards c ON c.id = r.card_id
         WHERE c.space_id = ? AND r.mode = 'recall' AND r.grade = 'forgot' AND r.undone_at IS NULL
         GROUP BY c.id
         HAVING forgotCount >= 2
         ORDER BY forgotCount DESC, c.term
         LIMIT ?`
      )
      .all(spaceId, HARDEST_LIMIT) as HardWord[]
  }
}
