import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FsrsCard, type FSRS } from 'ts-fsrs'
import type { CardProgress, Grade, ProgressState } from '../../shared/types'

export type { FsrsCard }
export type Clock = () => Date

type Step = `${number}${'m' | 'h' | 'd'}`

export interface SchedulerOptions {
  /** Шаги изучения новой карточки. */
  learningSteps?: Step[]
  /** Шаги после ошибки: примерно 1 мин, затем 10 мин (раздел 10.2). */
  relearningSteps?: Step[]
  /** Случайный разброс длинных интервалов; в тестах выключается. */
  fuzz?: boolean
}

export const DEFAULT_STEPS: Step[] = ['1m', '10m']

const STATE_NAMES: Record<State, ProgressState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning'
}

/**
 * Обёртка над FSRS. Две оценки отображаются на входы алгоритма так:
 * «Вспомнил» → Good, «Не вспомнил» → Again. Голосовая и ручная оценка
 * в MVP-5 используют этот же метод (SRS-13).
 */
export class Scheduler {
  private readonly engine: FSRS

  constructor(options: SchedulerOptions = {}) {
    this.engine = fsrs(
      generatorParameters({
        enable_fuzz: options.fuzz ?? true,
        enable_short_term: true,
        learning_steps: options.learningSteps ?? DEFAULT_STEPS,
        relearning_steps: options.relearningSteps ?? DEFAULT_STEPS
      })
    )
  }

  initial(now: Date): FsrsCard {
    return createEmptyCard(now)
  }

  apply(card: FsrsCard, grade: Grade, now: Date): FsrsCard {
    return this.engine.next(card, now, grade === 'remembered' ? Rating.Good : Rating.Again).card
  }
}

export function serializeProgress(card: FsrsCard): string {
  return JSON.stringify(card)
}

export function parseProgress(json: string): FsrsCard {
  const raw = JSON.parse(json) as Omit<FsrsCard, 'due' | 'last_review'> & { due: string; last_review?: string | null }
  const { last_review, ...rest } = raw
  return { ...rest, due: new Date(raw.due), ...(last_review ? { last_review: new Date(last_review) } : {}) }
}

export function stateName(state: State): ProgressState {
  return STATE_NAMES[state]
}

export function toCardProgress(card: FsrsCard, introducedAt: string | null): CardProgress {
  return {
    state: stateName(card.state),
    due: card.due.toISOString(),
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
    introducedAt
  }
}
