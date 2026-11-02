import { describe, expect, it } from 'vitest'
import { DomainError } from './errors'
import { setup } from './test-helpers'

describe('CardService', () => {
  it('creates a card with examples and initial progress', () => {
    const t = setup()
    const card = t.addCard({
      examples: [{ text: 'I run every day.', translation: 'Every day I go running.' }, { text: 'Run!' }]
    })
    expect(card.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(card.version).toBe(1)
    expect(card.examples).toEqual([
      { text: 'I run every day.', translation: 'Every day I go running.', maskFragments: [] },
      { text: 'Run!', translation: null, maskFragments: [] }
    ])
    expect(card.progress.state).toBe('new')
    expect(t.cards.list('en').map((c) => c.id)).toEqual([card.id])
  })

  it('fills in the transcription automatically and keeps a manual one', () => {
    const t = setup()
    expect(t.addCard({ term: 'loophole' }).transcription).toBe('ˈlupˌhoʊl')
    expect(t.addCard({ spaceId: 'es', term: 'llamar' }).transcription).toBe('ʃaˈmaɾ')
    expect(t.addCard({ term: 'loophole', transcription: '/ˈluːphəʊl/' }).transcription).toBe('ˈluːphəʊl')
    expect(t.addCard({ term: 'doomscrolling' }).transcription).toBeNull()
  })

  it('rebuilds the transcription when the word changes, but keeps a manual edit without a word change', () => {
    const t = setup()
    const card = t.addCard({ term: 'run', transcription: 'rʌn!' })
    expect(t.cards.update(card.id, { version: 1, meaning: 'to dash' }).transcription).toBe('rʌn!')
    expect(t.cards.update(card.id, { version: 2, term: 'loophole' }).transcription).toBe('ˈlupˌhoʊl')
    expect(t.cards.update(card.id, { version: 3, transcription: '' }).transcription).toBe('ˈlupˌhoʊl')
  })

  it('fills in transcriptions of cards without one, without changing the version', () => {
    const t = setup()
    const card = t.addCard({ term: 'loophole' })
    t.db.prepare('UPDATE cards SET transcription = NULL').run()
    expect(t.cards.fillMissingTranscriptions()).toBe(1)
    expect(t.cards.get(card.id)).toMatchObject({ transcription: 'ˈlupˌhoʊl', version: 1 })
  })

  it('a Spanish card has two pronunciations, an English one has one (D44)', () => {
    const t = setup()
    const es = t.addCard({ spaceId: 'es', term: 'llamar' })
    expect(es).toMatchObject({ transcription: 'ʃaˈmaɾ', transcriptionAlt: 'ʝaˈmaɾ' })
    expect(t.addCard({ term: 'loophole', transcriptionAlt: 'x' }).transcriptionAlt).toBeNull()

    // A manual edit is kept; when the word changes, both variants are rebuilt.
    expect(t.cards.update(es.id, { version: 1, transcriptionAlt: '/ʎaˈmaɾ/' }).transcriptionAlt).toBe('ʎaˈmaɾ')
    expect(t.cards.update(es.id, { version: 2, meaning: 'to call' }).transcriptionAlt).toBe('ʎaˈmaɾ')
    expect(t.cards.update(es.id, { version: 3, term: 'cerveza' })).toMatchObject({ transcription: 'seɾˈbesa', transcriptionAlt: 'θeɾˈbeθa' })

    // Cards created before the second variant are filled in without a version change.
    t.db.prepare('UPDATE cards SET transcription_alt = NULL').run()
    expect(t.cards.fillMissingTranscriptions()).toBe(1)
    expect(t.cards.get(es.id)).toMatchObject({ transcriptionAlt: 'θeɾˈbeθa', version: 4 })
  })

  it('Study shows both pronunciations with their voice languages', () => {
    const t = setup()
    t.addCard({ spaceId: 'es', term: 'llamar' })
    const next = t.study.next('es')
    if (next.kind !== 'card' || next.mode !== 'intro') throw new Error('Expected an intro card')
    expect(next.back.pronunciations).toEqual([
      { label: 'Argentina', flag: '🇦🇷', lang: 'es-AR', transcription: 'ʃaˈmaɾ' },
      { label: 'Spain', flag: '🇪🇸', lang: 'es-ES', transcription: 'ʝaˈmaɾ' }
    ])
  })

  it("picks an emoji automatically and keeps the user's choice", () => {
    const t = setup()
    const auto = t.addCard({ term: 'trapped', meaning: 'caught in a trap' })
    expect(auto).toMatchObject({ emoji: '🪤', emojiAuto: true })

    const chosen = t.addCard({ term: 'trapped', meaning: 'caught in a trap', emoji: '🕸️' })
    expect(chosen).toMatchObject({ emoji: '🕸️', emojiAuto: false })
    const none = t.addCard({ term: 'trapped', meaning: 'caught in a trap', emoji: null })
    expect(none).toMatchObject({ emoji: null, emojiAuto: false })

    // Changing the word or meaning updates only an automatic emoji.
    expect(t.cards.update(auto.id, { version: 1, term: 'stain', meaning: 'a dirty mark' }).emoji).not.toBe('🪤')
    expect(t.cards.update(chosen.id, { version: 1, meaning: 'a cat' }).emoji).toBe('🕸️')
    expect(t.cards.update(none.id, { version: 1, meaning: 'a cat' }).emoji).toBeNull()
  })

  it('fills in an automatic emoji without touching the user choice of "no emoji"', () => {
    const t = setup()
    const auto = t.addCard({ term: 'trapped', meaning: 'caught in a trap' })
    const none = t.addCard({ term: 'trapped', meaning: 'caught in a trap', emoji: null })
    t.db.prepare('UPDATE cards SET emoji = NULL WHERE emoji_auto = 1').run()
    expect(t.cards.fillMissingEmojis()).toBe(1)
    expect(t.cards.get(auto.id).emoji).toBe('🪤')
    expect(t.cards.get(none.id).emoji).toBeNull()
  })

  it('checks required fields', () => {
    const t = setup()
    expect(() => t.addCard({ term: '  ' })).toThrow('Enter a word or phrase')
    expect(() => t.addCard({ meaning: '' })).toThrow('Enter a meaning')
    expect(() => t.cards.create({ spaceId: 'fr', term: 'a', meaning: 'b' })).toThrow()
  })

  it('keeps cards of different languages apart', () => {
    const t = setup()
    t.addCard()
    t.addCard({ spaceId: 'es', term: 'correr' })
    expect(t.cards.list('en').map((c) => c.term)).toEqual(['run'])
    expect(t.cards.list('es').map((c) => c.term)).toEqual(['correr'])
  })

  it('keeps progress when the content is edited', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('remembered')
    const before = t.cards.get(card.id).progress

    const updated = t.cards.update(card.id, {
      version: 1,
      meaning: 'to dash',
      examples: [{ text: 'They ran.', maskFragments: ['ran'] }]
    })
    expect(updated.version).toBe(2)
    expect(updated.meaning).toBe('to dash')
    expect(updated.examples[0]?.maskFragments).toEqual(['ran'])
    expect(updated.progress).toEqual(before)
  })

  it('resets progress only on an explicit request', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('remembered')

    const reset = t.cards.update(card.id, { version: 1, term: 'sprint', resetProgress: true })
    expect(reset.progress.state).toBe('new')
    expect(reset.progress.reps).toBe(0)
  })

  it('does not overwrite a newer version', () => {
    const t = setup()
    const card = t.addCard()
    t.cards.update(card.id, { version: 1, meaning: 'to dash' })
    try {
      t.cards.update(card.id, { version: 1, meaning: 'to rush' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('CONFLICT')
    }
    expect(t.cards.get(card.id).meaning).toBe('to dash')
  })

  it('deletes a card together with its progress and history', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('forgot')

    t.cards.delete(card.id)
    expect(() => t.cards.get(card.id)).toThrow('Card not found')
    expect(t.db.prepare('SELECT COUNT(*) FROM review_log').pluck().get()).toBe(0)
    expect(t.db.prepare('SELECT COUNT(*) FROM card_progress').pluck().get()).toBe(0)
  })
})
