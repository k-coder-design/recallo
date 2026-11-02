import { describe, expect, it } from 'vitest'
import { toSpeechText } from './speech'

describe('text for speech', () => {
  it.each([
    ['¿Cómo te llamás?', 'es-ES', 'Cómo te llamás?'],
    ['¡Hola!', 'es-ES', 'Hola!'],
    ['¿Como te va? / ¿Qué tal?', 'es-ES', 'Como te va? Qué tal?'],
    ['¡Buenos días! / ¡Buen día!', 'es-ES', 'Buenos días! Buen día!'],
    ['Me llamo / Mi nombre es', 'es-AR', 'Me llamo. Mi nombre es'],
    ['hold/keep sth (sb) at bay', 'en-US', 'hold or keep something (somebody) at bay'],
    ['steer someone/something towards something/someone', 'en-US', 'steer someone or something towards something or someone'],
    ['casa/hogar', 'es-ES', 'casa o hogar'],
    ['go the extra mile', 'en-US', 'go the extra mile']
  ])('%s (%s) → %s', (text, lang, expected) => {
    expect(toSpeechText(text, lang)).toBe(expected)
  })

  it('leaves Spanish words with sb/sth inside untouched', () => {
    expect(toSpeechText('sbarro sthe', 'es-ES')).toBe('sbarro sthe')
  })
})
