import { describe, expect, it } from 'vitest'
import { DomainError } from './errors'
import { setup } from './test-helpers'

describe('CardService', () => {
  it('создаёт карточку с примерами и начальным прогрессом', () => {
    const t = setup()
    const card = t.addCard({
      examples: [{ text: 'I run every day.', translation: 'Я бегаю каждый день.' }, { text: 'Run!' }]
    })
    expect(card.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(card.version).toBe(1)
    expect(card.examples).toEqual([
      { text: 'I run every day.', translation: 'Я бегаю каждый день.', maskFragments: [] },
      { text: 'Run!', translation: null, maskFragments: [] }
    ])
    expect(card.progress.state).toBe('new')
    expect(t.cards.list('en').map((c) => c.id)).toEqual([card.id])
  })

  it('заполняет транскрипцию автоматически и сохраняет ручную', () => {
    const t = setup()
    expect(t.addCard({ term: 'loophole' }).transcription).toBe('ˈlupˌhoʊl')
    expect(t.addCard({ spaceId: 'es', term: 'llamar' }).transcription).toBe('ʃaˈmaɾ')
    expect(t.addCard({ term: 'loophole', transcription: '/ˈluːphəʊl/' }).transcription).toBe('ˈluːphəʊl')
    expect(t.addCard({ term: 'doomscrolling' }).transcription).toBeNull()
  })

  it('пересчитывает транскрипцию при смене слова, но не трогает ручную правку без смены слова', () => {
    const t = setup()
    const card = t.addCard({ term: 'run', transcription: 'rʌn!' })
    expect(t.cards.update(card.id, { version: 1, meaning: 'бежать' }).transcription).toBe('rʌn!')
    expect(t.cards.update(card.id, { version: 2, term: 'loophole' }).transcription).toBe('ˈlupˌhoʊl')
    expect(t.cards.update(card.id, { version: 3, transcription: '' }).transcription).toBe('ˈlupˌhoʊl')
  })

  it('дозаполняет транскрипцию карточек без неё, не меняя версию', () => {
    const t = setup()
    const card = t.addCard({ term: 'loophole' })
    t.db.prepare('UPDATE cards SET transcription = NULL').run()
    expect(t.cards.fillMissingTranscriptions()).toBe(1)
    expect(t.cards.get(card.id)).toMatchObject({ transcription: 'ˈlupˌhoʊl', version: 1 })
  })

  it('у испанской карточки два варианта произношения, у английской — один (D44)', () => {
    const t = setup()
    const es = t.addCard({ spaceId: 'es', term: 'llamar' })
    expect(es).toMatchObject({ transcription: 'ʃaˈmaɾ', transcriptionAlt: 'ʝaˈmaɾ' })
    expect(t.addCard({ term: 'loophole', transcriptionAlt: 'x' }).transcriptionAlt).toBeNull()

    // Ручная правка сохраняется, при смене слова оба варианта строятся заново.
    expect(t.cards.update(es.id, { version: 1, transcriptionAlt: '/ʎaˈmaɾ/' }).transcriptionAlt).toBe('ʎaˈmaɾ')
    expect(t.cards.update(es.id, { version: 2, meaning: 'звать' }).transcriptionAlt).toBe('ʎaˈmaɾ')
    expect(t.cards.update(es.id, { version: 3, term: 'cerveza' })).toMatchObject({ transcription: 'seɾˈbesa', transcriptionAlt: 'θeɾˈbeθa' })

    // Карточки, созданные до второго варианта, дозаполняются без смены версии.
    t.db.prepare('UPDATE cards SET transcription_alt = NULL').run()
    expect(t.cards.fillMissingTranscriptions()).toBe(1)
    expect(t.cards.get(es.id)).toMatchObject({ transcriptionAlt: 'θeɾˈbeθa', version: 4 })
  })

  it('в Study видны оба варианта произношения с языками голоса', () => {
    const t = setup()
    t.addCard({ spaceId: 'es', term: 'llamar' })
    const next = t.study.next('es')
    if (next.kind !== 'card' || next.mode !== 'intro') throw new Error('Expected an intro card')
    expect(next.back.pronunciations).toEqual([
      { label: 'Argentina', flag: '🇦🇷', lang: 'es-AR', transcription: 'ʃaˈmaɾ' },
      { label: 'Spain', flag: '🇪🇸', lang: 'es-ES', transcription: 'ʝaˈmaɾ' }
    ])
  })

  it('подбирает эмодзи автоматически и сохраняет выбор пользователя', () => {
    const t = setup()
    const auto = t.addCard({ term: 'trapped', meaning: 'в ловушке' })
    expect(auto).toMatchObject({ emoji: '🪤', emojiAuto: true })

    const chosen = t.addCard({ term: 'trapped', meaning: 'в ловушке', emoji: '🕸️' })
    expect(chosen).toMatchObject({ emoji: '🕸️', emojiAuto: false })
    const none = t.addCard({ term: 'trapped', meaning: 'в ловушке', emoji: null })
    expect(none).toMatchObject({ emoji: null, emojiAuto: false })

    // Смена слова или значения обновляет только автоматическое эмодзи.
    expect(t.cards.update(auto.id, { version: 1, term: 'stain', meaning: 'пятно' }).emoji).not.toBe('🪤')
    expect(t.cards.update(chosen.id, { version: 1, meaning: 'кошка' }).emoji).toBe('🕸️')
    expect(t.cards.update(none.id, { version: 1, meaning: 'кошка' }).emoji).toBeNull()
  })

  it('дозаполняет автоматическое эмодзи, не трогая «без эмодзи» пользователя', () => {
    const t = setup()
    const auto = t.addCard({ term: 'trapped', meaning: 'в ловушке' })
    const none = t.addCard({ term: 'trapped', meaning: 'в ловушке', emoji: null })
    t.db.prepare('UPDATE cards SET emoji = NULL WHERE emoji_auto = 1').run()
    expect(t.cards.fillMissingEmojis()).toBe(1)
    expect(t.cards.get(auto.id).emoji).toBe('🪤')
    expect(t.cards.get(none.id).emoji).toBeNull()
  })

  it('проверяет обязательные поля', () => {
    const t = setup()
    expect(() => t.addCard({ term: '  ' })).toThrow('Enter a word or phrase')
    expect(() => t.addCard({ meaning: '' })).toThrow('Enter a meaning')
    expect(() => t.cards.create({ spaceId: 'fr', term: 'a', meaning: 'b' })).toThrow()
  })

  it('держит карточки языков раздельно', () => {
    const t = setup()
    t.addCard()
    t.addCard({ spaceId: 'es', term: 'correr' })
    expect(t.cards.list('en').map((c) => c.term)).toEqual(['run'])
    expect(t.cards.list('es').map((c) => c.term)).toEqual(['correr'])
  })

  it('сохраняет прогресс при редактировании содержимого', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('remembered')
    const before = t.cards.get(card.id).progress

    const updated = t.cards.update(card.id, {
      version: 1,
      meaning: 'бежать',
      examples: [{ text: 'They ran.', maskFragments: ['ran'] }]
    })
    expect(updated.version).toBe(2)
    expect(updated.meaning).toBe('бежать')
    expect(updated.examples[0]?.maskFragments).toEqual(['ran'])
    expect(updated.progress).toEqual(before)
  })

  it('сбрасывает прогресс только по явному запросу', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('remembered')

    const reset = t.cards.update(card.id, { version: 1, term: 'sprint', resetProgress: true })
    expect(reset.progress.state).toBe('new')
    expect(reset.progress.reps).toBe(0)
  })

  it('не даёт перезаписать более свежую версию', () => {
    const t = setup()
    const card = t.addCard()
    t.cards.update(card.id, { version: 1, meaning: 'бежать' })
    try {
      t.cards.update(card.id, { version: 1, meaning: 'мчаться' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('CONFLICT')
    }
    expect(t.cards.get(card.id).meaning).toBe('бежать')
  })

  it('удаляет карточку вместе с прогрессом и историей', () => {
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
