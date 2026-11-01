import type { Swell, SwellLabel } from '../../shared/types'

/** Сколько последних дней (включая сегодня) учитывается для регулярности. */
export const SWELL_WINDOW_DAYS = 7
/** Сколько ответов вспоминания нужно, чтобы точность начала влиять на волну. */
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
  /** Дни с занятиями за последние 7 дней, включая сегодня. */
  activeDays: number
  /** Занимались ли сегодня. */
  activeToday: boolean
  /** Сколько дней с занятиями останется в окне завтра без учёта самого завтра (день 7 дней назад выпадет). */
  activeDaysKeptTomorrow: number
  /** Ответы вспоминания за 14 дней. */
  recalls: number
  remembered: number
  /** Слова, которые уже начали учить (не New), и из них дошедшие до Familiar/Learned. */
  started: number
  mastered: number
}

/**
 * «Today's swell» (D40): высота волны, которую ученик может покорить, — от регулярности (50%),
 * точности вспоминания за 2 недели (30%) и доли освоенных слов (20%). Расписание FSRS не меняется.
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
