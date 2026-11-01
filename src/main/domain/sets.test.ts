import { describe, expect, it } from 'vitest'
import { toAppError } from './errors'
import { expectIntro, expectRecall, MINUTE, setup } from './test-helpers'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    // Тот же путь, что в IPC: ошибки домена и валидации приводятся к коду ответа.
    return toAppError(error).code
  }
  return undefined
}

describe('SetService', () => {
  it('создаёт, переименовывает и защищает от перезаписи свежей версии', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie', description: 'Words about films' })
    expect(set).toMatchObject({ name: 'Movie', description: 'Words about films', cardCount: 0, version: 1 })

    const renamed = t.sets.update(set.id, { version: 1, name: 'Movies' })
    expect(renamed).toMatchObject({ name: 'Movies', description: 'Words about films', version: 2 })
    expect(codeOf(() => t.sets.update(set.id, { version: 1, name: 'Films' }))).toBe('CONFLICT')
  })

  it('не допускает два набора с одним названием в одном языке', () => {
    const t = setup()
    t.sets.create({ spaceId: 'en', name: 'Movie' })
    expect(codeOf(() => t.sets.create({ spaceId: 'en', name: 'movie' }))).toBe('VALIDATION')
    expect(t.sets.create({ spaceId: 'es', name: 'Movie' }).spaceId).toBe('es')
  })

  it('удаляет набор, оставляя карточки без набора с прогрессом', () => {
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

  it('удаляет набор вместе с карточками только по явной политике', () => {
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

  it('не кладёт карточку в набор другого языка', () => {
    const t = setup()
    const spanish = t.sets.create({ spaceId: 'es', name: 'Saludos' })
    expect(codeOf(() => t.addCard({ setId: spanish.id }))).toBe('VALIDATION')
  })
})

describe('карточки и наборы', () => {
  it('переносит карточки между наборами без потери прогресса', () => {
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

  it('фильтрует по набору и «без набора» и ищет по слову, значению и набору', () => {
    const t = setup()
    const movie = t.sets.create({ spaceId: 'en', name: 'Movie' })
    t.addCard({ term: 'thrilling', meaning: 'захватывающий', setId: movie.id })
    t.addCard({ term: 'loophole', meaning: 'лазейка' })

    expect(t.cards.list('en', { scope: { kind: 'set', setId: movie.id } }).map((c) => c.term)).toEqual(['thrilling'])
    expect(t.cards.list('en', { scope: { kind: 'none' } }).map((c) => c.term)).toEqual(['loophole'])
    expect(t.cards.list('en', { search: 'ЛАЗЕЙ' }).map((c) => c.term)).toEqual(['loophole'])
    expect(t.cards.list('en', { search: 'movie' }).map((c) => c.term)).toEqual(['thrilling'])
    expect(t.cards.list('en', { search: 'thrill', scope: { kind: 'none' } })).toEqual([])
  })

  it('находит дубли без учёта регистра, пунктуации, to/the и вариантов через « / »', () => {
    const t = setup()
    const existing = t.addCard({ term: 'to embrace', meaning: 'принять' })
    t.addCard({ spaceId: 'es', term: '¡Hola!', meaning: 'Hello' })
    expect(t.cards.findDuplicates('en', 'Embrace').map((d) => d.id)).toEqual([existing.id])
    expect(t.cards.findDuplicates('en', 'embraced')).toEqual([])
    expect(t.cards.findDuplicates('en', 'embrace', existing.id)).toEqual([])
    expect(t.cards.findDuplicates('es', 'hola / buenas')).toHaveLength(1)
  })
})

describe('обучение по набору и отмена оценки', () => {
  it('учит только карточки набора, а прогресс общий с обучением всего языка', () => {
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

    // В общей очереди та же карточка уже знакома: прогресс один на карточку (SRS-09).
    t.advance(MINUTE)
    expect(expectRecall(t.study.next('en')).cardId).toBe(inSet.id)
    expect(t.study.counts('en', { kind: 'none' })).toMatchObject({ due: 0, new: 1 })
  })

  it('отменяет оценку вспоминания: прогресс как был, карточка показывается снова', () => {
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

    // Повторная отмена ничего не меняет.
    expect(t.study.undo(result.reviewId).undone.duplicate).toBe(true)
    expect(t.cards.get(card.id).progress).toEqual(before)
  })

  it('отменяет знакомство: карточка снова новая', () => {
    const t = setup()
    const card = t.addCard()
    const { result } = t.answer('remembered')
    expect(t.cards.get(card.id).progress.introducedAt).not.toBeNull()
    const { next } = t.study.undo(result.reviewId)
    expect(t.cards.get(card.id).progress.introducedAt).toBeNull()
    expect(expectIntro(next).cardId).toBe(card.id)
  })

  it('отменяет только последнюю оценку неизменённой карточки', () => {
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

  it('считает забывания для подсказки на обороте без отменённых оценок', () => {
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
