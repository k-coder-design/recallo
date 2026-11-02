import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FsrsCard, type FSRS } from 'ts-fsrs'
import type { CardProgress, Grade, ProgressState } from '../../shared/types'

export type { FsrsCard }
export type Clock = () => Date

type Step = `${number}${'m' | 'h' | 'd'}`

export interface SchedulerOptions {
  /** Learning steps of a new card. */
  learningSteps?: Step[]
  /** Steps after a mistake: about 1 min, then 10 min (section 10.2). */
  relearningSteps?: Step[]
  /** Random spread of long intervals; turned off in tests. */
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
 * A wrapper over FSRS. The two grades map to the algorithm's inputs like this:
 * "Remembered" → Good, "Forgot" → Again. Voice and manual grading
 * in MVP-5 would use the same method (SRS-13).
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
