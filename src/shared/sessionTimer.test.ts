import { describe, expect, it } from 'vitest'
import { extendTimer, isTimeUp, remainingMs, startTimer } from './sessionTimer'

const MINUTE = 60_000

describe('Timed session', () => {
  it('without a limit there is no timer and time never runs out', () => {
    const timer = startTimer('off', 0)
    expect(timer).toBeNull()
    expect(isTimeUp(timer, 10 * 60 * MINUTE)).toBe(false)
  })

  it('counts down the chosen length and reports when time is up', () => {
    const timer = startTimer('5', 1000)
    expect(timer).toEqual({ endsAt: 1000 + 5 * MINUTE, plannedMinutes: 5 })
    expect(remainingMs(timer!, 1000 + 2 * MINUTE)).toBe(3 * MINUTE)
    expect(isTimeUp(timer, 1000 + 5 * MINUTE - 1)).toBe(false)
    expect(isTimeUp(timer, 1000 + 5 * MINUTE)).toBe(true)
    expect(remainingMs(timer!, 1000 + 6 * MINUTE)).toBe(0)
  })

  it('an extension counts from the moment of the tap if time is already up', () => {
    const timer = startTimer('10', 0)!
    const extended = extendTimer(timer, 5, 12 * MINUTE)
    expect(extended).toEqual({ endsAt: 17 * MINUTE, plannedMinutes: 15 })
  })

  it('an extension before time is up is added to the remaining minutes', () => {
    const timer = startTimer('10', 0)!
    expect(extendTimer(timer, 15, 4 * MINUTE)).toEqual({ endsAt: 25 * MINUTE, plannedMinutes: 25 })
  })
})
