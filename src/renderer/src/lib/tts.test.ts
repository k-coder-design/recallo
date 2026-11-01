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

describe('выбор голоса', () => {
  it('аргентинский вариант звучит улучшенным голосом Diego, испанский — Mónica', () => {
    expect(chooseVoice('es-AR', system)).toMatchObject({ voice: { name: 'Diego (Enhanced)' }, exact: true })
    expect(chooseVoice('es-ES', system).voice?.name).toBe('Mónica')
    expect(chooseVoice('en-US', system).voice?.name).toBe('Samantha')
  })

  it('с аргентинским голосом озвучиваются оба испанских варианта', () => {
    expect(playableLangs(['es-AR', 'es-ES'], system)).toEqual(new Set(['es-AR', 'es-ES']))
  })

  it('без аргентинского голоса — только испанский вариант, аргентинский берёт ближайший латиноамериканский', () => {
    const withoutAr = system.filter((v) => v.lang !== 'es-AR')
    expect(playableLangs(['es-AR', 'es-ES'], withoutAr)).toEqual(new Set(['es-ES']))
    expect(chooseVoice('es-AR', withoutAr)).toMatchObject({ voice: { name: 'Paulina' }, exact: false })
  })
})
