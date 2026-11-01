import { describe, expect, it } from 'vitest'
import { toAppError } from './errors'
import { DEFAULT_NEW_PER_DAY } from './limits'
import { expectCard, expectIntro, MINUTE, setup, type TestContext } from './test-helpers'

const DAY = 24 * 60 * MINUTE

function addCards(t: TestContext, count: number, spaceId: 'en' | 'es' = 'en', setId?: string) {
  for (let i = 0; i < count; i++) t.addCard({ spaceId, term: `word${spaceId}${i}`, meaning: `значение ${i}`, ...(setId ? { setId } : {}) })
}

/** Знакомится с новыми словами, пока они идут; возвращает, сколько знакомств прошло. */
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

describe('Лимит новых слов в день (MVP-7)', () => {
  it('по умолчанию 10 знакомств в день, остальные новые ждут', () => {
    const t = setup()
    addCards(t, 12)
    expect(t.study.counts('en')).toMatchObject({ new: 10, newWaiting: 2, newToday: { limit: DEFAULT_NEW_PER_DAY, started: 0, remaining: 10 } })
    expect(meetAll(t)).toBe(10)
    expect(t.study.counts('en')).toMatchObject({ new: 0, newWaiting: 2, newToday: { started: 10, remaining: 0 } })
  })

  it('повторения лимит не ограничивает', () => {
    const t = setup()
    addCards(t, 12)
    meetAll(t)
    t.advance(MINUTE)
    // Все 10 знакомых слов доступны для вспоминания, хотя лимит новых исчерпан.
    expect(t.study.counts('en').due).toBe(10)
    expect(expectCard(t.study.next('en')).mode).toBe('recall')
  })

  it('«Learn 5 more today» добавляет ровно 5 знакомств и только на сегодня', () => {
    const t = setup()
    addCards(t, 20)
    meetAll(t)
    expect(t.limits.learnMore('en')).toMatchObject({ extra: 5, remaining: 5 })
    expect(meetAll(t)).toBe(5)
    t.advance(DAY)
    expect(t.limits.today('en')).toMatchObject({ extra: 0, started: 0, remaining: 10 })
  })

  it('на следующий день лимит снова полный', () => {
    const t = setup()
    addCards(t, 25)
    meetAll(t)
    t.advance(DAY)
    expect(t.study.counts('en')).toMatchObject({ new: 10, newWaiting: 5 })
  })

  it('отмена знакомства возвращает слово в лимит', () => {
    const t = setup()
    addCards(t, 12)
    for (let i = 0; i < 9; i++) meetOne(t)
    const last = meetOne(t)
    expect(t.limits.today('en').remaining).toBe(0)
    t.study.undo(last.reviewId)
    expect(t.limits.today('en')).toMatchObject({ started: 9, remaining: 1 })
  })

  it('отложенное «Not yet» занимает место в лимите и продолжается, даже когда лимит исчерпан', () => {
    const t = setup()
    t.limits.setNewPerDay('en', 2)
    addCards(t, 5)
    const first = expectIntro(t.study.next('en'))
    t.study.reveal(first.presentationId)
    t.study.grade(first.presentationId, 'forgot') // Not yet
    expect(t.limits.today('en')).toMatchObject({ started: 1, remaining: 1 })
    meetOne(t) // второе слово — лимит исчерпан
    expect(t.study.counts('en')).toMatchObject({ new: 1, newWaiting: 3 })
    t.advance(MINUTE)
    // Сначала вспоминание второго слова (порядок очереди D21), затем повтор отложенного знакомства.
    t.answer('remembered')
    const retry = expectIntro(t.study.next('en'))
    expect(retry.cardId).toBe(first.cardId)
  })

  it('лимит общий для языка при обучении по наборам и независимый между языками', () => {
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

  it('0 — только повторения; настройка проверяется', () => {
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
