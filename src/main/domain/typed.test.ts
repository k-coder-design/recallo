import { describe, expect, it } from 'vitest'
import { toAppError } from './errors'
import { expectIntro, expectRecall, setup } from './test-helpers'

interface LogRow {
  grade: string
  typed_answer: string | null
  auto_verdict: string | null
  overridden: number | null
}

const lastLog = (t: ReturnType<typeof setup>) =>
  t.db.prepare('SELECT grade, typed_answer, auto_verdict, overridden FROM review_log ORDER BY rowid DESC LIMIT 1').get() as LogRow

describe('Typed answer mode (MVP-8)', () => {
  it('a check reveals the answer and suggests a grade; an accepted grade does not count as an override', () => {
    const t = setup()
    t.addCard({ term: 'reckless', meaning: 'acting without care' })
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    const { back, check } = t.study.check(shown.presentationId, 'Reckless')
    expect(back.term).toBe('reckless')
    expect(check).toMatchObject({ verdict: 'correct', suggestedGrade: 'remembered' })
    t.study.grade(shown.presentationId, 'remembered')
    expect(lastLog(t)).toEqual({ grade: 'remembered', typed_answer: 'Reckless', auto_verdict: 'correct', overridden: 0 })
  })

  it('"I was right": the verdict is wrong, but the user grades Remembered — FSRS gets their grade', () => {
    const t = setup()
    const card = t.addCard({ term: 'reckless', meaning: 'acting without care' })
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    expect(t.study.check(shown.presentationId, 'heedless').check.verdict).toBe('wrong')
    const result = t.study.grade(shown.presentationId, 'remembered')
    expect(result.grade).toBe('remembered')
    expect(t.cards.get(card.id).progress.lapses).toBe(0)
    expect(lastLog(t)).toMatchObject({ auto_verdict: 'wrong', overridden: 1 })
  })

  it('"Count as forgot": the verdict is right, but the user grades Forgot', () => {
    const t = setup()
    t.addCard({ term: 'reckless', meaning: 'acting without care' })
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    t.study.check(shown.presentationId, 'reckless')
    expect(t.study.grade(shown.presentationId, 'forgot').grade).toBe('forgot')
    expect(lastLog(t)).toMatchObject({ grade: 'forgot', auto_verdict: 'correct', overridden: 1 })
  })

  it('a repeated check and a repeated grade change nothing', () => {
    const t = setup()
    t.addCard({ term: 'reckless', meaning: 'acting without care' })
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    t.study.check(shown.presentationId, 'careless')
    expect(t.study.check(shown.presentationId, 'reckless').check).toMatchObject({ typed: 'careless', verdict: 'wrong' })
    t.study.grade(shown.presentationId, 'forgot')
    expect(t.study.grade(shown.presentationId, 'forgot').duplicate).toBe(true)
    expect(t.db.prepare("SELECT COUNT(*) FROM review_log WHERE mode = 'recall'").pluck().get()).toBe(1)
  })

  it('a first meeting is not checked by typing; after a normal reveal the check is unavailable', () => {
    const t = setup()
    t.addCard({ term: 'reckless', meaning: 'acting without care' })
    const intro = expectIntro(t.study.next('en'))
    expect(toAppError(capture(() => t.study.check(intro.presentationId, 'x'))).code).toBe('VALIDATION')
    t.study.reveal(intro.presentationId)
    t.study.grade(intro.presentationId, 'remembered')
    expect(lastLog(t)).toMatchObject({ typed_answer: null, auto_verdict: null, overridden: null })

    t.introduceAll()
    t.advance(60_000)
    const recall = expectRecall(t.study.next('en'))
    t.study.reveal(recall.presentationId)
    expect(toAppError(capture(() => t.study.check(recall.presentationId, 'reckless'))).code).toBe('VALIDATION')
  })
})

function capture(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('Expected an error')
}
