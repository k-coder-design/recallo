import { describe, expect, it } from 'vitest'
import { toAppError } from './errors'
import { expectIntro, expectRecall, MINUTE, setup } from './test-helpers'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    // The same path as in IPC: domain and validation errors are mapped to a response code.
    return toAppError(error).code
  }
  return undefined
}

describe('SetService', () => {
  it('creates, renames and protects a newer version from overwriting', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie', description: 'Words about films' })
    expect(set).toMatchObject({ name: 'Movie', description: 'Words about films', cardCount: 0, version: 1 })

    const renamed = t.sets.update(set.id, { version: 1, name: 'Movies' })
    expect(renamed).toMatchObject({ name: 'Movies', description: 'Words about films', version: 2 })
    expect(codeOf(() => t.sets.update(set.id, { version: 1, name: 'Films' }))).toBe('CONFLICT')
  })

  it('does not allow two sets with the same name in one language', () => {
    const t = setup()
    t.sets.create({ spaceId: 'en', name: 'Movie' })
    expect(codeOf(() => t.sets.create({ spaceId: 'en', name: 'movie' }))).toBe('VALIDATION')
    expect(t.sets.create({ spaceId: 'es', name: 'Movie' }).spaceId).toBe('es')
  })

  it('deletes a set, leaving its cards without a set with their progress', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    const card = t.addCard({ setId: set.id })
    t.introduceAll()
    t.answer('remembered')
    const progress = t.cards.get(card.id).progress

    expect(t.sets.delete(set.id, 'keep-cards')).toEqual({ affectedCards: 1 })
    expect(t.cards.get(card.id)).toMatchObject({ setId: null, progress })
    expect(t.sets.list('en')).toEqual([])
  })

  it('deletes a set together with its cards only with an explicit policy', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    t.addCard({ term: 'a', setId: set.id })
    t.addCard({ term: 'b', setId: set.id })
    t.addCard({ term: 'c' })

    expect(codeOf(() => t.sets.delete(set.id, undefined))).toBe('VALIDATION')
    expect(t.sets.get(set.id).cardCount).toBe(2)
    expect(t.sets.delete(set.id, 'delete-cards')).toEqual({ affectedCards: 2 })
    expect(t.cards.list('en').map((c) => c.term)).toEqual(['c'])
  })

  it('does not put a card into a set of another language', () => {
    const t = setup()
    const spanish = t.sets.create({ spaceId: 'es', name: 'Saludos' })
    expect(codeOf(() => t.addCard({ setId: spanish.id }))).toBe('VALIDATION')
  })
})

describe('cards and sets', () => {
  it('moves cards between sets without losing progress', () => {
    const t = setup()
    const a = t.sets.create({ spaceId: 'en', name: 'A' })
    const b = t.sets.create({ spaceId: 'en', name: 'B' })
    const card = t.addCard({ setId: a.id })
    t.introduceAll()
    t.answer('forgot')
    const progress = t.cards.get(card.id).progress

    const [moved] = t.cards.moveToSet([card.id], b.id)
    expect(moved).toMatchObject({ setId: b.id, progress })
    expect(t.cards.update(card.id, { version: moved!.version, setId: null })).toMatchObject({ setId: null, progress })
    expect(t.sets.unsetCount('en')).toBe(1)
  })

  it('filters by set and "no set" and searches by word, meaning and set', () => {
    const t = setup()
    const movie = t.sets.create({ spaceId: 'en', name: 'Movie' })
    t.addCard({ term: 'thrilling', meaning: 'exciting', setId: movie.id })
    t.addCard({ term: 'loophole', meaning: 'лазейка' })

    expect(t.cards.list('en', { scope: { kind: 'set', setId: movie.id } }).map((c) => c.term)).toEqual(['thrilling'])
    expect(t.cards.list('en', { scope: { kind: 'none' } }).map((c) => c.term)).toEqual(['loophole'])
    // Cyrillic on purpose: the user's meanings are Russian, and search must ignore case there too.
    expect(t.cards.list('en', { search: 'ЛАЗЕЙ' }).map((c) => c.term)).toEqual(['loophole'])
    expect(t.cards.list('en', { search: 'movie' }).map((c) => c.term)).toEqual(['thrilling'])
    expect(t.cards.list('en', { search: 'thrill', scope: { kind: 'none' } })).toEqual([])
  })

  it('finds duplicates ignoring case, punctuation, to/the and variants split by " / "', () => {
    const t = setup()
    const existing = t.addCard({ term: 'to embrace', meaning: 'to accept' })
    t.addCard({ spaceId: 'es', term: '¡Hola!', meaning: 'Hello' })
    expect(t.cards.findDuplicates('en', 'Embrace').map((d) => d.id)).toEqual([existing.id])
    expect(t.cards.findDuplicates('en', 'embraced')).toEqual([])
    expect(t.cards.findDuplicates('en', 'embrace', existing.id)).toEqual([])
    expect(t.cards.findDuplicates('es', 'hola / buenas')).toHaveLength(1)
  })
})

describe('study by set and undo', () => {
  it('studies only the set cards, while progress is shared with studying the whole language', () => {
    const t = setup()
    const movie = t.sets.create({ spaceId: 'en', name: 'Movie' })
    const inSet = t.addCard({ term: 'thrilling', setId: movie.id })
    t.addCard({ term: 'loophole' })
    const scope = { kind: 'set' as const, setId: movie.id }

    expect(t.study.counts('en', scope)).toMatchObject({ due: 0, new: 1 })
    const shown = expectIntro(t.study.next('en', { scope }))
    expect(shown.cardId).toBe(inSet.id)
    t.study.reveal(shown.presentationId)
    t.study.grade(shown.presentationId, 'remembered')

    // In the shared queue the same card is already met: one progress per card (SRS-09).
    t.advance(MINUTE)
    expect(expectRecall(t.study.next('en')).cardId).toBe(inSet.id)
    expect(t.study.counts('en', { kind: 'none' })).toMatchObject({ due: 0, new: 1 })
  })

  it('undoes a recall grade: progress as it was, the card is shown again', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    const before = t.cards.get(card.id).progress
    const { result } = t.answer('forgot')
    expect(t.cards.get(card.id).progress).not.toEqual(before)

    const { undone, next } = t.study.undo(result.reviewId)
    expect(undone).toMatchObject({ reviewId: result.reviewId, grade: 'forgot', duplicate: false })
    expect(t.cards.get(card.id).progress).toEqual(before)
    expect(expectRecall(next).cardId).toBe(card.id)
    expect(t.stats.overview('en').today).toMatchObject({ forgot: 0 })

    // Undoing again changes nothing.
    expect(t.study.undo(result.reviewId).undone.duplicate).toBe(true)
    expect(t.cards.get(card.id).progress).toEqual(before)
  })

  it('undoes a meeting: the card is new again', () => {
    const t = setup()
    const card = t.addCard()
    const { result } = t.answer('remembered')
    expect(t.cards.get(card.id).progress.introducedAt).not.toBeNull()
    const { next } = t.study.undo(result.reviewId)
    expect(t.cards.get(card.id).progress.introducedAt).toBeNull()
    expect(expectIntro(next).cardId).toBe(card.id)
  })

  it('undoes only the last grade of an unchanged card', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    const first = t.answer('forgot').result
    t.advance(MINUTE)
    t.answer('forgot')
    expect(codeOf(() => t.study.undo(first.reviewId))).toBe('CONFLICT')

    const last = t.db.prepare('SELECT id FROM review_log ORDER BY reviewed_at DESC LIMIT 1').pluck().get() as string
    t.cards.update(card.id, { version: 1, resetProgress: true })
    expect(codeOf(() => t.study.undo(last))).toBe('CONFLICT')
  })

  it('counts forgets for the hint on the back without undone grades', () => {
    const t = setup()
    t.addCard()
    t.introduceAll()
    t.answer('forgot')
    t.advance(MINUTE)
    const { result } = t.answer('forgot')
    t.study.undo(result.reviewId)
    const shown = expectRecall(t.study.next('en', { allowEarly: true }))
    expect(t.study.reveal(shown.presentationId).forgotCount).toBe(1)
  })
})
