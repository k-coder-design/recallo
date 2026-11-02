import type { Swell, SwellLabel } from '../../shared/types'

/** How many recent days (including today) count for regularity. */
export const SWELL_WINDOW_DAYS = 7
/** How many recall answers are needed before accuracy affects the wave. */
export const SWELL_MIN_RECALLS = 5

const MIN_HEIGHT = 0.3
const MAX_HEIGHT = 4
const LABELS: [number, SwellLabel][] = [
  [0.9, 'Flat'],
  [1.5, 'Knee-high'],
  [2.1, 'Waist-high'],
  [2.8, 'Chest-high'],
  [3.4, 'Head-high'],
  [Infinity, 'Overhead']
]

export interface SwellInput {
  /** Days with study in the last 7 days, including today. */
  activeDays: number
  /** Whether there was study today. */
  activeToday: boolean
  /** How many study days will remain in the window tomorrow, not counting tomorrow itself (the day 7 days ago drops out). */
  activeDaysKeptTomorrow: number
  /** Recall answers over 14 days. */
  recalls: number
  remembered: number
  /** Words already being learned (not New), and of them those that reached Familiar/Learned. */
  started: number
  mastered: number
}

/**
 * "Today's swell" (D40): the wave height a learner can ride — from regularity (50%),
 * recall accuracy over 2 weeks (30%) and the share of mastered words (20%). The FSRS schedule does not change.
 */
export function computeSwell(input: SwellInput): Swell {
  const accuracy = input.recalls >= SWELL_MIN_RECALLS ? input.remembered / input.recalls : null
  const mastery = input.started > 0 ? input.mastered / input.started : 0
  const heightFor = (activeDays: number): number => {
    const consistency = Math.min(activeDays, SWELL_WINDOW_DAYS) / SWELL_WINDOW_DAYS
    const score = 0.5 * consistency + 0.3 * (accuracy ?? 0) + 0.2 * mastery
    return Math.round((MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * score) * 10) / 10
  }
  const height = heightFor(input.activeDays)
  const next = input.activeToday
    ? { when: 'tomorrow' as const, height: heightFor(input.activeDaysKeptTomorrow + 1) }
    : { when: 'today' as const, height: heightFor(input.activeDays + 1) }
  return {
    height,
    label: labelFor(height),
    activeDays: input.activeDays,
    windowDays: SWELL_WINDOW_DAYS,
    accuracy,
    mastery,
    next
  }
}

export function labelFor(height: number): SwellLabel {
  return (LABELS.find(([limit]) => height < limit) as [number, SwellLabel])[1]
}
