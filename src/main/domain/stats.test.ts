import { describe, expect, it } from 'vitest'
import { localDate } from './stats'
import { MINUTE, setup } from './test-helpers'

const DAY = 24 * 60 * MINUTE

describe('StatsService', () => {
  it('раскладывает слова по стадиям', () => {
    const t = setup()
    t.addCard({ term: 'a' })
    t.addCard({ term: 'b' })
    t.addCard({ term: 'c' })
    t.addCard({ term: 'd' })
    expect(t.stats.overview('en').stages).toEqual({ new: 4, introduced: 0, learning: 0, familiar: 0, learned: 0 })

    t.introduceAll()
    t.answer('forgot') // a → learning
    t.answer('remembered') // b → learning (шаг 10 мин)
    t.advance(10 * MINUTE)
    t.answer('remembered', { avoidCardId: undefined }) // a снова, остаётся в learning
    const stages = t.stats.overview('en').stages
    expect(stages.new).toBe(0)
    expect(stages.introduced + stages.learning + stages.familiar).toBe(4)
    expect(t.stats.overview('es').total).toBe(0)
  })

  it('считает Learned только при интервале от 3 недель', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    t.answer('remembered')
    t.advance(10 * MINUTE)
    t.answer('remembered') // вышла на долгосрочное повторение
    expect(t.stats.overview('en').stages.familiar).toBe(1)

    // Несколько успешных повторений подряд в срок растят интервал.
    for (let i = 0; i < 6; i++) {
      const due = new Date(t.cards.get(card.id).progress.due).getTime()
      t.advance(Math.max(0, due - t.now().getTime()))
      t.answer('remembered')
    }
    expect(t.stats.overview('en').stages.learned).toBe(1)
  })

  it('считает сегодняшние ответы, удержание и активность по дням', () => {
    const t = setup()
    t.addCard({ term: 'a' })
    t.addCard({ term: 'b' })
    t.introduceAll()
    t.answer('forgot')
    t.answer('remembered')

    const stats = t.stats.overview('en')
    expect(stats.today).toEqual({ remembered: 1, forgot: 1, introduced: 2 })
    expect(stats.retention30d).toBe(0.5)
    expect(stats.activity).toHaveLength(14)
    expect(stats.activity[13]).toMatchObject({ date: localDate(t.now()), remembered: 1, forgot: 1, introduced: 2 })
  })

  it('считает серию дней подряд и не обрывает её до конца сегодняшнего дня', () => {
    const t = setup()
    t.addCard({ term: 'a' })
    t.addCard({ term: 'b' })
    t.addCard({ term: 'c' })
    t.answer('remembered')
    t.advance(DAY)
    t.answer('remembered')
    expect(t.stats.overview('en').streakDays).toBe(2)
    t.advance(DAY)
    expect(t.stats.overview('en').streakDays).toBe(2)
    t.advance(DAY)
    expect(t.stats.overview('en').streakDays).toBe(0)
  })

  it('показывает слова, которые забывали минимум дважды', () => {
    const t = setup()
    const hard = t.addCard({ term: 'hard' })
    t.introduceAll()
    t.answer('forgot')
    t.advance(MINUTE)
    t.answer('forgot')
    expect(t.stats.overview('en').hardest).toEqual([
      { cardId: hard.id, term: 'hard', meaning: 'бегать', forgotCount: 2 }
    ])
  })
})
