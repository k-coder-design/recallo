import { describe, expect, it } from 'vitest'
import { searchEmojis, suggestEmoji, suggestEmojis } from './index'

// Russian meanings on purpose: the user's meanings are Russian, and emoji are matched in Russian too.
describe('emoji suggestions', () => {
  it('finds an association by word and meaning in different languages', () => {
    expect(suggestEmoji('trapped', 'unable to escape; в ловушке', 'en')).toBe('🪤')
    expect(suggestEmoji('¡Chau!', 'Bye!', 'es')).toBe('👋')
    expect(suggestEmojis('cat', 'кошка', 'en').some((e) => ['🐈', '🐱', '😺'].includes(e))).toBe(true)
  })

  it('returns null if there is no confident association', () => {
    expect(suggestEmoji('uncertainty', 'неопределенность', 'en')).toBeNull()
  })

  it('searches emoji manually in English and Russian', () => {
    expect(searchEmojis('rain')).toContain('☔️')
    expect(searchEmojis('кот')).toContain('🐱')
    expect(searchEmojis('')).toEqual([])
  })
})
