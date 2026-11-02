import { describe, expect, it } from 'vitest'
import { DomainError } from './errors'
import { expectCard, expectIntro, expectRecall, MINUTE, setup } from './test-helpers'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return error instanceof DomainError ? error.code : 'UNKNOWN'
  }
  return undefined
}

describe('StudyService: meeting new cards', () => {
  it('shows everything at once: word, meaning and examples (D53)', () => {
    const t = setup()
    t.addCard({ term: 'loophole', meaning: 'a gap in the rules', examples: [{ text: 'They found a loophole.' }] })
    const shown = expectIntro(t.study.next('en'))
    expect(shown.back).toMatchObject({ term: 'loophole', transcription: 'ˈlupˌhoʊl', ttsLang: 'en-US', meaning: 'a gap in the rules' })
    expect(shown.back.examples[0]?.segments.find((s) => s.masked)?.text).toBe('loophole')
    // Nothing to reveal: the meeting can be finished right away.
    expect(t.study.grade(shown.presentationId, 'remembered').mode).toBe('intro')
  })

  it('does not change FSRS and opens recall in about a minute', () => {
    const t = setup()
    const card = t.addCard()
    const { result } = t.answer('remembered')
    expect(result.mode).toBe('intro')

    const progress = t.cards.get(card.id).progress
    expect(progress).toMatchObject({ state: 'new', reps: 0, introducedAt: t.now().toISOString() })
    expect(t.study.counts('en')).toMatchObject({ due: 0, new: 0 })
    expect(t.study.next('en').kind).toBe('wait')

    t.advance(MINUTE)
    expect(t.study.counts('en')).toMatchObject({ due: 1, new: 0 })
    const recall = expectRecall(t.study.next('en'))
    expect(recall.front.meaning).toBe('to run')
  })

  it('"Not yet" repeats the meeting later, with other cards in between', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    expect(t.answer('forgot').shown.cardId).toBe(a.id)
    expect(t.cards.get(a.id).progress.introducedAt).toBeNull()

    expect(expectIntro(t.study.next('en', { avoidCardId: a.id })).cardId).toBe(b.id)
    t.answer('remembered', { avoidCardId: a.id })
    t.advance(MINUTE)
    // Both are ready again: first the recall of the met card b, then the repeated meeting with a.
    expect(expectRecall(t.study.next('en')).cardId).toBe(b.id)
    expect(expectIntro(t.study.next('en', { avoidCardId: b.id })).cardId).toBe(a.id)
  })

  it('skips the meeting for cards that were already recalled', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    t.answer('forgot')
    t.advance(MINUTE)
    expect(expectCard(t.study.next('en')).mode).toBe('recall')
  })

  it('a progress reset sends the card back to a meeting', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('remembered')
    t.cards.update(card.id, { version: 1, resetProgress: true })
    expect(t.cards.get(card.id).progress.introducedAt).toBeNull()
    expectIntro(t.study.next('en'))
  })

  it('does not apply a resubmitted meeting result', () => {
    const t = setup()
    t.addCard()
    const shown = expectIntro(t.study.next('en'))
    t.study.reveal(shown.presentationId)
    const first = t.study.grade(shown.presentationId, 'remembered')
    t.advance(MINUTE)
    expect(t.study.grade(shown.presentationId, 'remembered')).toEqual({ ...first, duplicate: true })
    expect(t.db.prepare("SELECT COUNT(*) FROM review_log WHERE mode = 'intro'").pluck().get()).toBe(1)
  })
})

describe('StudyService: recall', () => {
  it('does not show cards of another language', () => {
    const t = setup()
    t.addCard({ spaceId: 'es', term: 'correr' })
    expect(t.study.next('en').kind).toBe('done')
    expect(expectIntro(t.study.next('es')).back.term).toBe('correr')
  })

  it('hides the studied expression on the front and reveals it on the back', () => {
    const t = setup()
    t.addCard({ term: 'am used to', meaning: 'to be accustomed to', examples: [{ text: 'I am used to working remotely.' }] })
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    expect(JSON.stringify(shown.front)).not.toContain('used')
    expect(shown.front.examples[0]).toEqual([
      { text: 'I ', masked: false },
      { text: '', masked: true },
      { text: ' working remotely.', masked: false }
    ])

    const back = t.study.reveal(shown.presentationId)
    expect(back.term).toBe('am used to')
    expect(back.examples[0]?.segments.map((s) => s.text).join('')).toBe('I am used to working remotely.')
  })

  it('does not accept a grade before the answer is revealed', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    const recall = expectRecall(t.study.next('en'))
    expect(codeOf(() => t.study.grade(recall.presentationId, 'remembered'))).toBe('NOT_REVEALED')
    expect(t.cards.list('en')[0]?.progress.reps).toBe(0)
  })

  it('does not apply a resubmitted grade', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    t.study.reveal(shown.presentationId)
    const first = t.study.grade(shown.presentationId, 'remembered')
    const progressAfterFirst = t.cards.list('en')[0]?.progress

    t.advance(MINUTE)
    expect(t.study.grade(shown.presentationId, 'remembered')).toEqual({ ...first, duplicate: true })
    expect(t.cards.list('en')[0]?.progress).toEqual(progressAfterFirst)
    expect(t.db.prepare("SELECT COUNT(*) FROM review_log WHERE mode = 'recall'").pluck().get()).toBe(1)
  })

  it('brings the card back in about a minute after a mistake', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    const { result } = t.answer('forgot')
    expect(new Date(result.nextDue).getTime() - t.now().getTime()).toBe(MINUTE)
    expect(t.study.next('en').kind).toBe('wait')
    t.advance(MINUTE)
    expectRecall(t.study.next('en'))
  })

  it('without other cards allows showing early instead of blocking', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    t.answer('forgot')
    expect(t.study.next('en').kind).toBe('wait')
    expectRecall(t.study.next('en', { allowEarly: true }))
  })

  it('alternates cards when showing early instead of repeating one', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    t.introduceAll()
    t.answer('forgot')
    t.answer('forgot', { avoidCardId: a.id })
    expect(t.study.next('en', { avoidCardId: b.id }).kind).toBe('wait')
    expect(expectRecall(t.study.next('en', { avoidCardId: b.id, allowEarly: true })).cardId).toBe(a.id)
    expect(expectRecall(t.study.next('en', { avoidCardId: a.id, allowEarly: true })).cardId).toBe(b.id)
  })

  it('shows other cards between repeats of the same one', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    t.introduceAll()
    const { shown } = t.answer('forgot')
    expect(shown.cardId).toBe(a.id)
    t.advance(MINUTE)
    expect(expectCard(t.study.next('en', { avoidCardId: a.id })).cardId).toBe(b.id)
  })

  it('puts due reviews before meeting new cards', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    t.introduceAll()
    t.addCard({ term: 'b' })
    t.answer('forgot')
    t.advance(MINUTE)
    expect(expectRecall(t.study.next('en')).cardId).toBe(a.id)
  })

  it('does not drop a card after many mistakes', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    for (let i = 0; i < 15; i++) {
      const { shown, result } = t.answer('forgot')
      expect(shown.cardId).toBe(card.id)
      expect(['learning', 'relearning']).toContain(result.state)
      t.advance(MINUTE)
    }
  })

  it('moves a card to long-term review after successful answers', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    expect(t.answer('remembered').result.state).toBe('learning')
    t.advance(10 * MINUTE)
    const { result } = t.answer('remembered')
    expect(result.state).toBe('review')
    expect(new Date(result.nextDue).getTime() - t.now().getTime()).toBeGreaterThanOrEqual(24 * 60 * MINUTE)
    expect(t.study.next('en').kind).toBe('done')
  })

  it('counts reviews and new cards', () => {
    const t = setup()
    t.addCard({ term: 'a' })
    t.addCard({ term: 'b' })
    t.addCard({ spaceId: 'es', term: 'c' })
    expect(t.study.counts('en')).toMatchObject({ due: 0, new: 2 })
    t.answer('remembered')
    expect(t.study.counts('en')).toMatchObject({ due: 0, new: 1 })
    t.advance(MINUTE)
    expect(t.study.counts('en')).toMatchObject({ due: 1, new: 1 })
    expect(t.study.counts('es')).toMatchObject({ due: 0, new: 1 })
  })

  it('reports an expired presentation', () => {
    const t = setup()
    expect(codeOf(() => t.study.reveal('missing'))).toBe('PRESENTATION_EXPIRED')
  })
})

describe('StudyService: new words mixed with others (D56)', () => {
  /** Meet the shown card; the next one is requested the same way as in a Study session. */
  function meet(t: ReturnType<typeof setup>, next: ReturnType<typeof expectIntro>) {
    t.study.grade(next.presentationId, 'remembered')
    return next.cardId
  }

  it('after a meeting shows an already met word early, then the next new one', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    const c = t.addCard({ term: 'c' })
    meet(t, expectIntro(t.study.next('en')))
    // No other met words yet — the second new one still comes next.
    const second = expectIntro(t.study.next('en', { avoidCardId: a.id, afterNew: true }))
    expect(second.cardId).toBe(b.id)
    meet(t, second)
    // Now a recall of a comes between new words, even though the minute has not passed.
    expect(expectRecall(t.study.next('en', { avoidCardId: b.id, afterNew: true })).cardId).toBe(a.id)
    // After the recall — a new word again.
    expect(expectIntro(t.study.next('en', { avoidCardId: a.id })).cardId).toBe(c.id)
  })

  it('in a set mixes new words with learned words of that set', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    const known = t.addCard({ term: 'known', setId: set.id })
    t.introduceAll()
    t.answer('remembered')
    t.advance(10 * MINUTE)
    t.answer('remembered')
    expect(t.cards.get(known.id).progress.state).toBe('review')

    const fresh = t.addCard({ term: 'fresh', setId: set.id })
    const fresher = t.addCard({ term: 'fresher', setId: set.id })
    const scope = { kind: 'set', setId: set.id } as const
    expect(meet(t, expectIntro(t.study.next('en', { scope })))).toBe(fresh.id)
    // A set word due in a day — instead of a second new word in a row.
    expect(expectRecall(t.study.next('en', { scope, avoidCardId: fresh.id, afterNew: true })).cardId).toBe(known.id)
    // Across all cards of the language learned words are not shown early.
    expect(expectIntro(t.study.next('en', { avoidCardId: fresh.id, afterNew: true })).cardId).toBe(fresher.id)
  })

  it('without afterNew the order is unchanged: new words in a row', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    t.addCard({ term: 'c' })
    meet(t, expectIntro(t.study.next('en')))
    meet(t, expectIntro(t.study.next('en', { avoidCardId: a.id })))
    expectIntro(t.study.next('en', { avoidCardId: b.id }))
  })
})
