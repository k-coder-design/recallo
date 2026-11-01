import { describe, expect, it } from 'vitest'
import { setup } from './test-helpers'

function terms(t: ReturnType<typeof setup>, search: string): string[] {
  return t.cards.list('en', { search }).map((c) => c.term)
}

describe('Поиск карточек (D54)', () => {
  it('находит по части слова, по любому слову фразы и словам не подряд', () => {
    const t = setup()
    t.addCard({ term: 'hold/keep sth (sb) at bay', meaning: 'держать на расстоянии' })
    t.addCard({ term: 'charming', meaning: 'очаровательный' })
    expect(terms(t, 'char')).toEqual(['charming'])
    expect(terms(t, 'hold at bay')).toEqual(['hold/keep sth (sb) at bay'])
    expect(terms(t, 'keep bay')).toEqual(['hold/keep sth (sb) at bay'])
    expect(terms(t, 'очаров')).toEqual(['charming'])
  })

  it('каждое слово запроса должно найтись', () => {
    const t = setup()
    t.addCard({ term: 'hold/keep sth (sb) at bay', meaning: 'держать на расстоянии' })
    expect(terms(t, 'hold tight')).toEqual([])
  })

  it('прощает одну опечатку в словах от 5 букв, но не в коротких', () => {
    const t = setup()
    t.addCard({ term: 'ostensibly', meaning: 'как будто бы' })
    t.addCard({ term: 'rock', meaning: 'камень' })
    expect(terms(t, 'ostensably')).toEqual(['ostensibly'])
    expect(terms(t, 'ostemsib')).toEqual(['ostensibly'])
    expect(terms(t, 'rack')).toEqual([])
  })

  it('ищет в примерах и переводах', () => {
    const t = setup()
    t.addCard({ term: 'gripping', meaning: 'захватывающий', examples: [{ text: 'A gripping thriller.', translation: 'Захватывающий триллер.' }] })
    expect(terms(t, 'thriller')).toEqual(['gripping'])
    expect(terms(t, 'триллер')).toEqual(['gripping'])
  })

  it('короткий запрос ищет только начало слов', () => {
    const t = setup()
    t.addCard({ term: 'which', meaning: 'который' })
    t.addCard({ term: 'charming', meaning: 'очаровательный' })
    expect(terms(t, 'ch')).toEqual(['charming'])
  })

  it('сначала совпадения в слове карточки, потом в значении и примерах', () => {
    const t = setup()
    t.addCard({ term: 'gripping', meaning: 'захватывающий', examples: [{ text: 'It was a run of bad luck.' }] })
    t.addCard({ term: 'jog', meaning: 'run slowly' })
    t.addCard({ term: 'runway', meaning: 'взлётная полоса' })
    t.addCard({ term: 'run', meaning: 'бегать' })
    expect(terms(t, 'run')).toEqual(['run', 'runway', 'jog', 'gripping'])
  })
})
