import { describe, expect, it } from 'vitest'
import { setup } from './test-helpers'

function terms(t: ReturnType<typeof setup>, search: string): string[] {
  return t.cards.list('en', { search }).map((c) => c.term)
}

// Russian meanings on purpose: the user's meanings are Russian, and search must work on them.
describe('Card search (D54)', () => {
  it('finds by part of a word, by any word of a phrase and by words that are not adjacent', () => {
    const t = setup()
    t.addCard({ term: 'hold/keep sth (sb) at bay', meaning: 'держать на расстоянии' })
    t.addCard({ term: 'charming', meaning: 'очаровательный' })
    expect(terms(t, 'char')).toEqual(['charming'])
    expect(terms(t, 'hold at bay')).toEqual(['hold/keep sth (sb) at bay'])
    expect(terms(t, 'keep bay')).toEqual(['hold/keep sth (sb) at bay'])
    expect(terms(t, 'очаров')).toEqual(['charming'])
  })

  it('every word of the query must be found', () => {
    const t = setup()
    t.addCard({ term: 'hold/keep sth (sb) at bay', meaning: 'держать на расстоянии' })
    expect(terms(t, 'hold tight')).toEqual([])
  })

  it('forgives one typo in words of 5+ letters, but not in short ones', () => {
    const t = setup()
    t.addCard({ term: 'ostensibly', meaning: 'как будто бы' })
    t.addCard({ term: 'rock', meaning: 'камень' })
    expect(terms(t, 'ostensably')).toEqual(['ostensibly'])
    expect(terms(t, 'ostemsib')).toEqual(['ostensibly'])
    expect(terms(t, 'rack')).toEqual([])
  })

  it('searches examples and translations', () => {
    const t = setup()
    t.addCard({ term: 'gripping', meaning: 'захватывающий', examples: [{ text: 'A gripping thriller.', translation: 'Захватывающий триллер.' }] })
    expect(terms(t, 'thriller')).toEqual(['gripping'])
    expect(terms(t, 'триллер')).toEqual(['gripping'])
  })

  it('a short query matches only word beginnings', () => {
    const t = setup()
    t.addCard({ term: 'which', meaning: 'который' })
    t.addCard({ term: 'charming', meaning: 'очаровательный' })
    expect(terms(t, 'ch')).toEqual(['charming'])
  })

  it('matches in the card word come first, then in the meaning and examples', () => {
    const t = setup()
    t.addCard({ term: 'gripping', meaning: 'захватывающий', examples: [{ text: 'It was a run of bad luck.' }] })
    t.addCard({ term: 'jog', meaning: 'run slowly' })
    t.addCard({ term: 'runway', meaning: 'взлётная полоса' })
    t.addCard({ term: 'run', meaning: 'to run' })
    expect(terms(t, 'run')).toEqual(['run', 'runway', 'jog', 'gripping'])
  })
})
