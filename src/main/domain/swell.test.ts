import { describe, expect, it } from 'vitest'
import { computeSwell, labelFor, type SwellInput } from './swell'
import { MINUTE, setup } from './test-helpers'

const DAY = 24 * 60 * MINUTE
const base: SwellInput = { activeDays: 0, activeToday: false, activeDaysKeptTomorrow: 0, recalls: 0, remembered: 0, started: 0, mastered: 0 }

describe('Today’s swell', () => {
  it('no study is a flat sea; the maximum comes with daily study, accurate answers and mastered words', () => {
    expect(computeSwell(base)).toMatchObject({ height: 0.3, label: 'Flat', accuracy: null })
    expect(computeSwell({ ...base, activeDays: 7, activeToday: true, activeDaysKeptTomorrow: 6, recalls: 20, remembered: 20, started: 10, mastered: 10 })).toMatchObject({
      height: 4,
      label: 'Overhead'
    })
  })

  it('regularity weighs the most: every day of the week raises the wave', () => {
    const heights = [1, 3, 5, 7].map((activeDays) => computeSwell({ ...base, activeDays }).height)
    expect(heights).toEqual([...heights].sort((a, b) => a - b))
    expect(new Set(heights).size).toBe(4)
  })

  it('accuracy counts only from 5 recall answers', () => {
    expect(computeSwell({ ...base, recalls: 4, remembered: 4 }).accuracy).toBeNull()
    expect(computeSwell({ ...base, recalls: 5, remembered: 4 }).accuracy).toBe(0.8)
  })

  it('suggests the wave after studying: today if not studied yet, otherwise tomorrow', () => {
    const notYet = computeSwell({ ...base, activeDays: 3 })
    expect(notYet.next).toEqual({ when: 'today', height: computeSwell({ ...base, activeDays: 4 }).height })
    const done = computeSwell({ ...base, activeDays: 7, activeToday: true, activeDaysKeptTomorrow: 6 })
    expect(done.next).toEqual({ when: 'tomorrow', height: done.height })
  })

  it('wave labels grow with the height', () => {
    expect([0.3, 1, 1.8, 2.5, 3, 4].map(labelFor)).toEqual(['Flat', 'Knee-high', 'Waist-high', 'Chest-high', 'Head-high', 'Overhead'])
  })

  it('StatsService computes the wave from study days over the last week', () => {
    const t = setup()
    t.addCard({ term: 'a' })
    t.addCard({ term: 'b' })
    expect(t.stats.overview('en').swell).toMatchObject({ activeDays: 0, next: { when: 'today' } })

    t.introduceAll()
    t.advance(DAY)
    t.answer('remembered')
    const swell = t.stats.overview('en').swell
    expect(swell.activeDays).toBe(2)
    expect(swell.next.when).toBe('tomorrow')
    expect(swell.height).toBeGreaterThan(0.3)

    // After a week without study the wave goes down again.
    t.advance(8 * DAY)
    expect(t.stats.overview('en').swell.activeDays).toBe(0)
  })
})
