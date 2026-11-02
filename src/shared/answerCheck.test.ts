import { describe, expect, it } from 'vitest'
import { answerVariants, checkAnswer, diffAnswer } from './answerCheck'

describe('typed answer check (MVP-8)', () => {
  it.each([
    ['go the extra mile', 'Go the extra mile', 'en'],
    ['GO THE EXTRA MILE!', 'Go the extra mile', 'en'],
    ['the audacity', 'the audacity', 'en'],
    ['audacity', 'the audacity', 'en'],
    ['bug', 'to bug', 'en'],
    ['cope with   stress', 'cope with stress', 'en'],
    ['corazon', 'corazón', 'es'],
    ['como te llamas', '¿Cómo te llamás?', 'es'],
    ['que tal', '¿Como te va? / ¿Qué tal?', 'es'],
    ['keep sth at bay', 'hold/keep sth (sb) at bay', 'en'],
    ['hold something somebody at bay', 'hold/keep sth (sb) at bay', 'en'],
    ['get a grip', 'get a grip (on yourself)', 'en'],
    ['get a grip on yourself', 'get a grip (on yourself)', 'en'],
    ['be a recipe for trouble', 'be a recipe for disaster, trouble, success, etc.', 'en'],
    ['meet someone’s expectations', "meet sb's expectations", 'en']
  ] as const)('"%s" is correct for "%s"', (typed, term, space) => {
    expect(checkAnswer(typed, term, space)).toMatchObject({ verdict: 'correct', suggestedGrade: 'remembered' })
  })

  it('one typo in an answer of 5+ letters is almost and counts', () => {
    expect(checkAnswer('reckles', 'reckless', 'en')).toMatchObject({ verdict: 'almost', suggestedGrade: 'remembered' })
    expect(checkAnswer('seasonde', 'seasoned', 'en').verdict).toBe('wrong') // a swap is two edits
  })

  it('in a short word a typo is already a mistake', () => {
    expect(checkAnswer('lid', 'lit', 'en')).toMatchObject({ verdict: 'wrong', suggestedGrade: 'forgot' })
  })

  it('another word is wrong, empty input is empty', () => {
    expect(checkAnswer('careless', 'reckless', 'en')).toMatchObject({ verdict: 'wrong', expected: 'reckless' })
    expect(checkAnswer('   ', 'reckless', 'en')).toMatchObject({ verdict: 'empty', suggestedGrade: 'forgot' })
  })

  it('for a mistake shows the nearest answer variant and the difference', () => {
    const check = checkAnswer('Que tel', '¿Como te va? / ¿Qué tal?', 'es')
    expect(check.expected).toBe('¿Qué tal?')
    expect(check.diff.some((p) => p.kind === 'wrong')).toBe(true)
  })

  it('a card answer variants', () => {
    expect(answerVariants('hold/keep sth (sb) at bay')).toEqual(
      expect.arrayContaining(['hold sth sb at bay', 'keep sth sb at bay', 'hold sth at bay', 'keep sth at bay'])
    )
    expect(answerVariants('be a recipe for disaster, trouble, success, etc.')).toEqual([
      'be a recipe for disaster, trouble, success, etc.',
      'be a recipe for disaster',
      'be a recipe for trouble',
      'be a recipe for success'
    ])
  })

  it('a completely different answer is not compared character by character', () => {
    expect(checkAnswer('wrong guess', 'reckless', 'en').diff).toEqual([{ text: 'wrong guess', kind: 'wrong' }])
    expect(checkAnswer('reckels', 'reckless', 'en').diff.length).toBeGreaterThan(1)
  })

  it('difference: matched, extra and missing characters', () => {
    expect(diffAnswer('reckles', 'reckless')).toEqual([
      { text: 'reckles', kind: 'same' },
      { text: 's', kind: 'missing' }
    ])
    expect(diffAnswer('carless', 'careless')).toEqual([
      { text: 'car', kind: 'same' },
      { text: 'e', kind: 'missing' },
      { text: 'less', kind: 'same' }
    ])
    expect(diffAnswer('dul', 'dull').map((p) => p.text).join('')).toBe('dull')
  })
})
