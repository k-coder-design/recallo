import { describe, expect, it } from 'vitest'
import { searchEmojis, suggestEmoji, suggestEmojis } from './index'

describe('подбор эмодзи', () => {
  it('находит ассоциацию по слову и значению на разных языках', () => {
    expect(suggestEmoji('trapped', 'unable to escape; в ловушке', 'en')).toBe('🪤')
    expect(suggestEmoji('¡Chau!', 'Bye!', 'es')).toBe('👋')
    expect(suggestEmojis('cat', 'кошка', 'en').some((e) => ['🐈', '🐱', '😺'].includes(e))).toBe(true)
  })

  it('возвращает null, если уверенной ассоциации нет', () => {
    expect(suggestEmoji('uncertainty', 'неопределенность', 'en')).toBeNull()
  })

  it('ищет эмодзи вручную на английском и русском', () => {
    expect(searchEmojis('rain')).toContain('☔️')
    expect(searchEmojis('кот')).toContain('🐱')
    expect(searchEmojis('')).toEqual([])
  })
})
