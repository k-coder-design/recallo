import { describe, expect, it } from 'vitest'
import { containsTerm, hideMasked, maskExample } from './masking'
import type { Segment } from './types'

const render = (segments: Segment[]): string => segments.map((s) => (s.masked ? '___' : s.text)).join('')

describe('maskExample', () => {
  it('hides the phrase from the specification example', () => {
    expect(render(maskExample('I am used to working remotely.', 'am used to', [], 'en'))).toBe(
      'I ___ working remotely.'
    )
  })

  it('hides all occurrences ignoring case', () => {
    expect(render(maskExample('Run! I run every day. RUN.', 'run', [], 'en'))).toBe('___! I ___ every day. ___.')
  })

  it('hides simple word forms', () => {
    expect(render(maskExample('She runs, he is running.', 'run', [], 'en'))).toBe('She ___, he is ___.')
    expect(render(maskExample('Tengo dos casas.', 'casa', [], 'es'))).toBe('Tengo dos ___.')
    expect(render(maskExample('She is making tea.', 'make', [], 'en'))).toBe('She is ___ tea.')
    expect(render(maskExample('He studied, she studies.', 'study', [], 'en'))).toBe('He ___, she ___.')
  })

  it('does not hide part of another word', () => {
    expect(render(maskExample('Be careful with the car.', 'car', [], 'en'))).toBe('Be careful with the ___.')
  })

  it('supports explicit fragments for changed forms', () => {
    const segments = maskExample("I'm used to it. She went home.", 'am used to', ["'m used to", 'went'], 'en')
    expect(render(segments)).toBe('I___ it. She ___ home.')
  })

  it('handles different apostrophes and spaces', () => {
    expect(render(maskExample('I’m  used to it.', 'am used to', ["'m used to"], 'en'))).toBe('I___ it.')
  })

  it('works with letters with diacritics', () => {
    expect(render(maskExample('Estoy acostumbrado al frío. ACOSTUMBRADO.', 'acostumbrado', [], 'es'))).toBe(
      'Estoy ___ al frío. ___.'
    )
  })

  it('merges overlapping fragments into one placeholder', () => {
    expect(render(maskExample('I am used to it.', 'used', ['am used to'], 'en'))).toBe('I ___ it.')
  })

  it('leaves the example unchanged if the expression is not in it', () => {
    expect(maskExample('Nothing here.', 'run', [], 'en')).toEqual([{ text: 'Nothing here.', masked: false }])
  })
})

describe('maskExample: phrases from the real dictionary', () => {
  const cases: Array<[term: string, example: string, expected: string]> = [
    ['Go the extra mile', 'He always goes the extra mile for his clients.', 'He always ___ for his clients.'],
    ['point out', 'She pointed out the mistakes.', 'She ___ the mistakes.'],
    ['take off', 'Her business really took off', 'Her business really ___'],
    ['speak your mind', 'Everyone should speak their mind.', 'Everyone should ___.'],
    ['Second-guess yourself', 'I always second-guess myself.', 'I always ___.'],
    ['to imply', 'His tone implied that he was bored.', 'His tone ___ that he was bored.'],
    ['to forge a new path', 'Since forging a new path, she moved.', 'Since ___, she moved.'],
    ['a rat race', 'She is tired of the rat race.', 'She is tired of ___.'],
    ['the ick', 'It gave me the major ick.', 'It gave me the major ___.'],
    ['be concerned about', 'They are concerned about it.', 'They ___ it.'],
    ['Be meticulous', "He's meticulous with details.", 'He___ with details.'],
    ['be running on empty', "He's been running on empty.", "He's ___."],
    ['settle an account', 'We need to settle the account.', 'We need to ___.'],
    ['read up on something', 'She read up on the culture.', 'She ___ the culture.'],
    ['back someone up', 'Will you back me up?', 'Will you ___?'],
    ['put something on the back burner', 'We put the new project on the back burner.', 'We ___.'],
    ['hold/keep sth (sb) at bay', 'She tried to hold her fears at bay.', 'She tried to ___.'],
    ['get a grip (on yourself)', 'She took a moment to get a grip before responding.', 'She took a moment to ___ before responding.'],
    ['meet sb\'s expectations', "He tries to meet his parents' expectations", 'He tries to ___']
  ]

  it.each(cases)('%s', (term, example, expected) => {
    expect(render(maskExample(example, term, [], 'en'))).toBe(expected)
  })

  it('does not hide function words apart from the expression', () => {
    expect(render(maskExample('To be or not to be.', 'to imply', [], 'en'))).toBe('To be or not to be.')
    expect(render(maskExample('The cat sat.', 'a rat race', [], 'en'))).toBe('The cat sat.')
  })
})

describe('maskExample: Spanish phrases', () => {
  const cases: Array<[term: string, example: string, expected: string]> = [
    ['¡Hasta luego!', '¡Hasta luego, amigos! ¡Cuídense!', '¡___, amigos! ¡Cuídense!'],
    ['¡Hasta mañana!', 'Gracias por la ayuda. ¡Hasta mañana!', 'Gracias por la ayuda. ¡___!'],
    ['Mucho gusto / un gusto', 'Hola, soy María. Mucho gusto.', 'Hola, soy María. ___.'],
    ['Me llamo / Mi nombre es', 'Hola, me llamo María. Mi nombre es Ana.', 'Hola, ___ María. ___ Ana.'],
    ['¿Como te va? / ¿Qué tal?', '¡Buenos días! ¿Cómo te va?', '¡Buenos días! ¿___?'],
    ['¡Buenos días! / ¡Buen día!', '¡Buen día! ¿Cómo te va?', '¡___! ¿Cómo te va?'],
    ['Muy bien', '- ¿Cómo estás?\n- Muy bien', '- ¿Cómo estás?\n- ___']
  ]

  it.each(cases)('%s', (term, example, expected) => {
    expect(render(maskExample(example, term, [], 'es'))).toBe(expected)
  })

  it('does not confuse words that differ in more than the accent', () => {
    expect(render(maskExample('El año pasado.', 'ano', [], 'es'))).toBe('El año pasado.')
  })
})

describe('hideMasked', () => {
  it('removes hidden text from the front side', () => {
    const hidden = hideMasked(maskExample('I run.', 'run', [], 'en'))
    expect(hidden.map((s) => s.text).join('')).not.toContain('run')
  })
})

describe('containsTerm', () => {
  it('finds the answer in the definition', () => {
    expect(containsTerm('to be used to something', 'used to', 'en')).toBe(true)
    expect(containsTerm('to be accustomed', 'used to', 'en')).toBe(false)
  })
})
