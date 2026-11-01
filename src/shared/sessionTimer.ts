/** Сессия по таймеру (D43): длительность выбирается перед стартом, по окончании — итог или продление. */
export const SESSION_LENGTHS = ['off', '5', '10', '15'] as const
export type SessionLength = (typeof SESSION_LENGTHS)[number]
export const EXTEND_MINUTES = [5, 10, 15] as const

const MINUTE_MS = 60_000

export interface SessionTimer {
  /** Когда время сессии заканчивается (мс с эпохи). */
  endsAt: number
  /** Сколько минут сессии запланировано вместе с продлениями. */
  plannedMinutes: number
}

export function startTimer(length: SessionLength, now: number): SessionTimer | null {
  if (length === 'off') return null
  const minutes = Number(length)
  return { endsAt: now + minutes * MINUTE_MS, plannedMinutes: minutes }
}

/** Продление отсчитывается от текущего момента: время, пока висел экран итога, не теряется и не дарится. */
export function extendTimer(timer: SessionTimer | null, minutes: number, now: number): SessionTimer {
  return { endsAt: Math.max(now, timer?.endsAt ?? now) + minutes * MINUTE_MS, plannedMinutes: (timer?.plannedMinutes ?? 0) + minutes }
}

export function remainingMs(timer: SessionTimer, now: number): number {
  return Math.max(0, timer.endsAt - now)
}

export function isTimeUp(timer: SessionTimer | null, now: number): boolean {
  return timer !== null && now >= timer.endsAt
}
