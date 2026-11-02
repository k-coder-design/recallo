import { describe, expect, it } from 'vitest'
import { toAppError } from './errors'
import { DEFAULT_NEW_PER_DAY } from './limits'
import { expectCard, expectIntro, MINUTE, setup, type TestContext } from './test-helpers'

const DAY = 24 * 60 * MINUTE

function addCards(t: TestContext, count: number, spaceId: 'en' | 'es' = 'en', setId?: string) {
  for (let i = 0; i < count; i++) t.addCard({ spaceId, term: `word${spaceId}${i}`, meaning: `meaning ${i}`, ...(setId ? { setId } : {}) })
}

/** Meets new words while they keep coming; returns how many meetings happened. */
function meetAll(t: TestContext, spaceId: 'en' | 'es' = 'en', scope?: { kind: 'set'; setId: string }): number {
  let met = 0
  for (;;) {
    const next = t.study.next(spaceId, { scope })
    if (next.kind !== 'card' || next.mode !== 'intro') return met
    t.study.reveal(next.presentationId)
    t.study.grade(next.presentationId, 'remembered')
    met++
  }
}

describe('Daily new-word limit (MVP-7)', () => {
  it('by default 10 meetings a day, the other new words wait', () => {
    const t = setup()
    addCards(t, 12)
    expect(t.study.counts('en')).toMatchObject({ new: 10, newWaiting: 2, newToday: { limit: DEFAULT_NEW_PER_DAY, started: 0, remaining: 10 } })
    expect(meetAll(t)).toBe(10)
    expect(t.study.counts('en')).toMatchObject({ new: 0, newWaiting: 2, newToday: { started: 10, remaining: 0 } })
  })

  it('the limit does not restrict reviews', () => {
    const t = setup()
    addCards(t, 12)
    meetAll(t)
    t.advance(MINUTE)
    // All 10 met words are available for recall, even though the new-word limit is reached.
    expect(t.study.counts('en').due).toBe(10)
    expect(expectCard(t.study.next('en')).mode).toBe('recall')
  })

  it('"Learn 5 more today" adds exactly 5 meetings and only for today', () => {
    const t = setup()
    addCards(t, 20)
    meetAll(t)
    expect(t.limits.learnMore('en')).toMatchObject({ extra: 5, remaining: 5 })
    expect(meetAll(t)).toBe(5)
    t.advance(DAY)
    expect(t.limits.today('en')).toMatchObject({ extra: 0, started: 0, remaining: 10 })
  })

  it('the next day the limit is full again', () => {
    const t = setup()
    addCards(t, 25)
    meetAll(t)
    t.advance(DAY)
    expect(t.study.counts('en')).toMatchObject({ new: 10, newWaiting: 5 })
  })

  it('undoing a meeting returns the word to the limit', () => {
    const t = setup()
    addCards(t, 12)
    for (let i = 0; i < 9; i++) meetOne(t)
    const last = meetOne(t)
    expect(t.limits.today('en').remaining).toBe(0)
    t.study.undo(last.reviewId)
    expect(t.limits.today('en')).toMatchObject({ started: 9, remaining: 1 })
  })

  it('a postponed "Not yet" takes a place in the limit and continues even when the limit is reached', () => {
    const t = setup()
    t.limits.setNewPerDay('en', 2)
    addCards(t, 5)
    const first = expectIntro(t.study.next('en'))
    t.study.reveal(first.presentationId)
    t.study.grade(first.presentationId, 'forgot') // Not yet
    expect(t.limits.today('en')).toMatchObject({ started: 1, remaining: 1 })
    meetOne(t) // the second word — the limit is reached
    expect(t.study.counts('en')).toMatchObject({ new: 1, newWaiting: 3 })
    t.advance(MINUTE)
    // First the recall of the second word (queue order D21), then the repeated postponed meeting.
    t.answer('remembered')
    const retry = expectIntro(t.study.next('en'))
    expect(retry.cardId).toBe(first.cardId)
  })

  it('the limit is shared within a language when studying by sets and independent between languages', () => {
    const t = setup()
    const a = t.sets.create({ spaceId: 'en', name: 'A' })
    const b = t.sets.create({ spaceId: 'en', name: 'B' })
    addCards(t, 8, 'en', a.id)
    addCards(t, 8, 'en', b.id)
    addCards(t, 3, 'es')
    expect(meetAll(t, 'en', { kind: 'set', setId: a.id })).toBe(8)
    expect(t.study.counts('en', { kind: 'set', setId: b.id })).toMatchObject({ new: 2, newWaiting: 6 })
    expect(t.study.counts('es')).toMatchObject({ new: 3, newToday: { remaining: 10 } })
  })

  it('0 — reviews only; the setting is validated', () => {
    const t = setup()
    addCards(t, 3)
    t.limits.setNewPerDay('en', 0)
    expect(t.study.counts('en')).toMatchObject({ new: 0, newWaiting: 3 })
    expect(t.study.next('en').kind).toBe('done')
    expect(toAppError(capture(() => t.limits.setNewPerDay('en', -1))).code).toBe('VALIDATION')
    expect(toAppError(capture(() => t.limits.setNewPerDay('en', 2.5))).code).toBe('VALIDATION')
    expect(t.limits.newPerDay('es')).toBe(DEFAULT_NEW_PER_DAY)
  })
})

function meetOne(t: TestContext) {
  const shown = expectIntro(t.study.next('en'))
  t.study.reveal(shown.presentationId)
  return t.study.grade(shown.presentationId, 'remembered')
}

function capture(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('Expected an error')
}
