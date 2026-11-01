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

describe('StudyService: знакомство с новыми карточками', () => {
  it('сразу показывает всё: слово, значение и примеры (D53)', () => {
    const t = setup()
    t.addCard({ term: 'loophole', meaning: 'лазейка', examples: [{ text: 'They found a loophole.' }] })
    const shown = expectIntro(t.study.next('en'))
    expect(shown.back).toMatchObject({ term: 'loophole', transcription: 'ˈlupˌhoʊl', ttsLang: 'en-US', meaning: 'лазейка' })
    expect(shown.back.examples[0]?.segments.find((s) => s.masked)?.text).toBe('loophole')
    // Раскрывать нечего: знакомство можно сразу завершить.
    expect(t.study.grade(shown.presentationId, 'remembered').mode).toBe('intro')
  })

  it('не меняет FSRS, а открывает вспоминание примерно через минуту', () => {
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
    expect(recall.front.meaning).toBe('бегать')
  })

  it('«Not yet» повторяет знакомство позже, между — другие карточки', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    expect(t.answer('forgot').shown.cardId).toBe(a.id)
    expect(t.cards.get(a.id).progress.introducedAt).toBeNull()

    expect(expectIntro(t.study.next('en', { avoidCardId: a.id })).cardId).toBe(b.id)
    t.answer('remembered', { avoidCardId: a.id })
    t.advance(MINUTE)
    // Обе снова готовы: сначала вспоминание знакомой b, затем повторное знакомство с a.
    expect(expectRecall(t.study.next('en')).cardId).toBe(b.id)
    expect(expectIntro(t.study.next('en', { avoidCardId: b.id })).cardId).toBe(a.id)
  })

  it('пропускает знакомство для карточек, которые уже вспоминали', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    t.answer('forgot')
    t.advance(MINUTE)
    expect(expectCard(t.study.next('en')).mode).toBe('recall')
  })

  it('сброс прогресса снова отправляет карточку на знакомство', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('remembered')
    t.cards.update(card.id, { version: 1, resetProgress: true })
    expect(t.cards.get(card.id).progress.introducedAt).toBeNull()
    expectIntro(t.study.next('en'))
  })

  it('не применяет повторно отправленный результат знакомства', () => {
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

describe('StudyService: вспоминание', () => {
  it('не показывает карточки другого языка', () => {
    const t = setup()
    t.addCard({ spaceId: 'es', term: 'correr' })
    expect(t.study.next('en').kind).toBe('done')
    expect(expectIntro(t.study.next('es')).back.term).toBe('correr')
  })

  it('скрывает изучаемое выражение на лицевой стороне и раскрывает на обратной', () => {
    const t = setup()
    t.addCard({ term: 'am used to', meaning: 'быть привыкшим', examples: [{ text: 'I am used to working remotely.' }] })
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

  it('не принимает оценку до раскрытия ответа', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    const recall = expectRecall(t.study.next('en'))
    expect(codeOf(() => t.study.grade(recall.presentationId, 'remembered'))).toBe('NOT_REVEALED')
    expect(t.cards.list('en')[0]?.progress.reps).toBe(0)
  })

  it('не применяет повторно отправленную оценку', () => {
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

  it('после ошибки возвращает карточку примерно через минуту', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    const { result } = t.answer('forgot')
    expect(new Date(result.nextDue).getTime() - t.now().getTime()).toBe(MINUTE)
    expect(t.study.next('en').kind).toBe('wait')
    t.advance(MINUTE)
    expectRecall(t.study.next('en'))
  })

  it('без других карточек позволяет показать раньше срока, не блокируя', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    t.answer('forgot')
    expect(t.study.next('en').kind).toBe('wait')
    expectRecall(t.study.next('en', { allowEarly: true }))
  })

  it('раньше срока чередует карточки, а не повторяет одну подряд', () => {
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

  it('показывает другие карточки между повторами одной и той же', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    t.introduceAll()
    const { shown } = t.answer('forgot')
    expect(shown.cardId).toBe(a.id)
    t.advance(MINUTE)
    expect(expectCard(t.study.next('en', { avoidCardId: a.id })).cardId).toBe(b.id)
  })

  it('ставит наступившие повторения раньше знакомства с новыми', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    t.introduceAll()
    t.addCard({ term: 'b' })
    t.answer('forgot')
    t.advance(MINUTE)
    expect(expectRecall(t.study.next('en')).cardId).toBe(a.id)
  })

  it('не исключает карточку после многих ошибок', () => {
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

  it('выводит карточку на долгосрочное повторение после успешных ответов', () => {
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

  it('считает повторения и новые карточки', () => {
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

  it('сообщает об устаревшем показе', () => {
    const t = setup()
    expect(codeOf(() => t.study.reveal('missing'))).toBe('PRESENTATION_EXPIRED')
  })
})

describe('StudyService: новые слова вперемешку с другими (D56)', () => {
  /** Знакомство с показанной карточкой; следующая запрашивается так же, как в сессии Study. */
  function meet(t: ReturnType<typeof setup>, next: ReturnType<typeof expectIntro>) {
    t.study.grade(next.presentationId, 'remembered')
    return next.cardId
  }

  it('после знакомства показывает уже знакомое слово раньше срока, затем следующее новое', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    const c = t.addCard({ term: 'c' })
    meet(t, expectIntro(t.study.next('en')))
    // Других знакомых слов ещё нет — второе новое всё-таки идёт следом.
    const second = expectIntro(t.study.next('en', { avoidCardId: a.id, afterNew: true }))
    expect(second.cardId).toBe(b.id)
    meet(t, second)
    // Теперь между новыми — вспоминание a, хотя минута ещё не прошла.
    expect(expectRecall(t.study.next('en', { avoidCardId: b.id, afterNew: true })).cardId).toBe(a.id)
    // После вспоминания снова новое слово.
    expect(expectIntro(t.study.next('en', { avoidCardId: a.id })).cardId).toBe(c.id)
  })

  it('в наборе перемежает новые слова выученными словами этого набора', () => {
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
    // Слово набора, до повторения которого ещё сутки, — вместо второго нового подряд.
    expect(expectRecall(t.study.next('en', { scope, avoidCardId: fresh.id, afterNew: true })).cardId).toBe(known.id)
    // Во всех карточках языка выученные слова раньше срока не показываются.
    expect(expectIntro(t.study.next('en', { avoidCardId: fresh.id, afterNew: true })).cardId).toBe(fresher.id)
  })

  it('без afterNew порядок прежний: новые подряд', () => {
    const t = setup()
    const a = t.addCard({ term: 'a' })
    const b = t.addCard({ term: 'b' })
    t.addCard({ term: 'c' })
    meet(t, expectIntro(t.study.next('en')))
    meet(t, expectIntro(t.study.next('en', { avoidCardId: a.id })))
    expectIntro(t.study.next('en', { avoidCardId: b.id }))
  })
})
