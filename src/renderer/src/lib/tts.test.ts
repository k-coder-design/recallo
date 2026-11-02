import { describe, expect, it } from 'vitest'
import { chooseVoice, playableLangs, voiceRegion } from './tts'

const voice = (name: string, lang: string) => ({ name, lang, localService: true, default: false, voiceURI: name }) as SpeechSynthesisVoice
const system = [
  voice('Eddy (Spanish (Spain))', 'es-ES'),
  voice('Mónica', 'es-ES'),
  voice('Paulina', 'es-MX'),
  voice('Diego', 'es-AR'),
  voice('Diego (Enhanced)', 'es-AR'),
  voice('Isabela', 'es-AR'),
  voice('Albert', 'en-US'),
  voice('Samantha', 'en-US')
]

describe('voice choice', () => {
  it('the Argentine variant uses the enhanced Diego voice, the Spanish one Mónica', () => {
    expect(chooseVoice('es-AR', system)).toMatchObject({ voice: { name: 'Diego (Enhanced)' }, exact: true })
    expect(chooseVoice('es-ES', system).voice?.name).toBe('Mónica')
    expect(chooseVoice('en-US', system).voice?.name).toBe('Samantha')
  })

  it('with an Argentine voice both Spanish variants are spoken', () => {
    expect(playableLangs(['es-AR', 'es-ES'], system)).toEqual(new Set(['es-AR', 'es-ES']))
  })

  it('without an Argentine voice the Argentine variant plays with the Mexican stand-in (as on iPhone)', () => {
    const withoutAr = system.filter((v) => v.lang !== 'es-AR')
    expect(playableLangs(['es-AR', 'es-ES'], withoutAr)).toEqual(new Set(['es-AR', 'es-ES']))
    expect(chooseVoice('es-AR', withoutAr)).toMatchObject({ voice: { name: 'Paulina' }, exact: false, near: true })
    expect(voiceRegion(chooseVoice('es-AR', withoutAr).voice)).toBe('Mexican')
  })

  it('with only Spanish (Spain) voices the Argentine variant is not played: it would sound like Spain', () => {
    const spainOnly = system.filter((v) => v.lang === 'es-ES')
    expect(playableLangs(['es-AR', 'es-ES'], spainOnly)).toEqual(new Set(['es-ES']))
  })

  it('matches language codes written differently on iOS (es_AR, es-ar)', () => {
    const ios = [voice('Mónica', 'es_ES'), voice('Diego', 'es_AR'), voice('Paulina', 'es-mx')]
    expect(chooseVoice('es-AR', ios)).toMatchObject({ voice: { name: 'Diego' }, exact: true })
    expect(chooseVoice('es-ES', ios)).toMatchObject({ voice: { name: 'Mónica' }, exact: true })
    expect(playableLangs(['es-AR', 'es-ES'], ios)).toEqual(new Set(['es-AR', 'es-ES']))
  })
})
