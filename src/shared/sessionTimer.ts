/** Timed session (D43): the length is chosen before starting; at the end — a summary or an extension. */
export const SESSION_LENGTHS = ['off', '5', '10', '15'] as const
export type SessionLength = (typeof SESSION_LENGTHS)[number]
export const EXTEND_MINUTES = [5, 10, 15] as const

const MINUTE_MS = 60_000

export interface SessionTimer {
  /** When the session time ends (ms since the epoch). */
  endsAt: number
  /** How many session minutes are planned, including extensions. */
  plannedMinutes: number
}

export function startTimer(length: SessionLength, now: number): SessionTimer | null {
  if (length === 'off') return null
  const minutes = Number(length)
  return { endsAt: now + minutes * MINUTE_MS, plannedMinutes: minutes }
}

/** An extension counts from now: time spent on the summary screen is neither lost nor given away. */
export function extendTimer(timer: SessionTimer | null, minutes: number, now: number): SessionTimer {
  return { endsAt: Math.max(now, timer?.endsAt ?? now) + minutes * MINUTE_MS, plannedMinutes: (timer?.plannedMinutes ?? 0) + minutes }
}

export function remainingMs(timer: SessionTimer, now: number): number {
  return Math.max(0, timer.endsAt - now)
}

export function isTimeUp(timer: SessionTimer | null, now: number): boolean {
  return timer !== null && now >= timer.endsAt
}
