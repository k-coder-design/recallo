import { describe, expect, it } from 'vitest'
import { chooseVoice, playableLangs } from './tts'

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

  it('without an Argentine voice only the Spanish variant is spoken; the Argentine one takes the nearest Latin American voice', () => {
    const withoutAr = system.filter((v) => v.lang !== 'es-AR')
    expect(playableLangs(['es-AR', 'es-ES'], withoutAr)).toEqual(new Set(['es-ES']))
    expect(chooseVoice('es-AR', withoutAr)).toMatchObject({ voice: { name: 'Paulina' }, exact: false })
  })

  it('matches language codes written differently on iOS (es_AR, es-ar)', () => {
    const ios = [voice('Mónica', 'es_ES'), voice('Diego', 'es_AR'), voice('Paulina', 'es-mx')]
    expect(chooseVoice('es-AR', ios)).toMatchObject({ voice: { name: 'Diego' }, exact: true })
    expect(chooseVoice('es-ES', ios)).toMatchObject({ voice: { name: 'Mónica' }, exact: true })
    expect(playableLangs(['es-AR', 'es-ES'], ios)).toEqual(new Set(['es-AR', 'es-ES']))
  })
})
