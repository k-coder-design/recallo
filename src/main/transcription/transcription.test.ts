import { describe, expect, it } from 'vitest'
import { arpabetToIpa } from './english'
import { normalizeTranscription, transcribe, transcribeAlt } from './index'

describe('английская транскрипция (CMU → IPA)', () => {
  it('ставит ударение перед началом ударного слога', () => {
    expect(arpabetToIpa('L UW1 P HH OW2 L')).toBe('ˈlupˌhoʊl')
    expect(arpabetToIpa('M AH0 T IH1 K Y AH0 L AH0 S')).toBe('məˈtɪkjələs')
    expect(arpabetToIpa('IH0 K S T R AO1 R D AH0 N EH2 R IY0')).toBe('ɪkˈstrɔrdəˌnɛri')
  })

  it('не ставит ударение в односложных словах', () => {
    expect(arpabetToIpa('G UH1 D')).toBe('ɡʊd')
  })

  it('транскрибирует фразы и сокращения словарных статей', () => {
    expect(transcribe('am used to', 'en')).toBe('æm just tu')
    expect(transcribe('Go the extra mile', 'en')).toBe('ɡoʊ ðə ˈɛkstrə maɪl')
    expect(transcribe("meet sb's expectations", 'en')).toBe('mit ˈsʌmˌbɑdiz ˌɛkspɛkˈteɪʃənz')
  })

  it('ставит ударения в сложных словах через дефис', () => {
    expect(transcribe('binge-watch', 'en')).toBe('ˈbɪndʒˌwɑtʃ')
    expect(transcribe('second-guess', 'en')).toBe('ˈsɛkəndˌɡɛs')
    expect(transcribe('sky-high', 'en')).toBe('ˈskaɪˌhaɪ')
    expect(transcribe('like-minded', 'en')).toBe('ˌlaɪkˈmaɪndəd')
    expect(transcribe('out-of-pocket', 'en')).toBe('ˌaʊtʌvˈpɑkət')
  })

  it('возвращает null, если слова нет в словаре', () => {
    expect(transcribe('doomscrolling', 'en')).toBeNull()
  })
})

describe('испанская транскрипция (rioplatense)', () => {
  const cases: Array<[string, string]> = [
    ['¡Hola!', 'ˈola'],
    ['Me llamo / Mi nombre es', 'me ˈʃamo / mi ˈnombɾe es'],
    ['¿Cómo te llamás?', 'ˈkomo te ʃaˈmas'],
    ['¡Hasta mañana!', 'ˈasta maˈɲana'],
    ['¡Adiós!', 'aˈdjos'],
    ['¡Buenos días!', 'ˈbwenos ˈdias'],
    ['¡Chau!', 'tʃaw'],
    ['Muy bien', 'muj bjen'],
    ['hoy', 'oj'],
    ['acostumbrarse', 'akostumˈbɾaɾse'],
    ['correr', 'koˈreɾ'],
    ['cuídense', 'ˈkwidense'],
    ['guerra', 'ˈɡera'],
    ['pingüino', 'pinˈɡwino'],
    ['excelente', 'ekseˈlente'],
    ['hablar', 'aˈblaɾ'],
    ['país', 'paˈis'],
    ['yo', 'ʃo']
  ]

  it.each(cases)('%s → %s', (term, expected) => {
    expect(transcribe(term, 'es')).toBe(expected)
  })
})

describe('испанская транскрипция, вариант Испании (D44)', () => {
  it.each([
    ['Me llamo / Mi nombre es', 'me ˈʝamo / mi ˈnombɾe es'],
    ['¿Cómo te llamás?', 'ˈkomo te ʝaˈmas'],
    ['¡Buenas noches!', 'ˈbwenas ˈnotʃes'],
    ['cerveza', 'θeɾˈbeθa'],
    ['¡Hasta mañana!', 'ˈasta maˈɲana'],
    ['yo', 'ʝo'],
    ['muy', 'muj']
  ])('%s → %s', (term, ipa) => {
    expect(transcribeAlt(term, 'es')).toBe(ipa)
  })

  it('в аргентинском варианте те же слова звучат с [ʃ] и [s]', () => {
    expect(transcribe('cerveza', 'es')).toBe('seɾˈbesa')
    expect(transcribe('yo', 'es')).toBe('ʃo')
  })

  it('у английского второго варианта нет', () => {
    expect(transcribeAlt('water', 'en')).toBeNull()
  })
})

describe('normalizeTranscription', () => {
  it('убирает косые черты и скобки, пустое превращает в null', () => {
    expect(normalizeTranscription(' /ˈola/ ')).toBe('ˈola')
    expect(normalizeTranscription('[ˈola]')).toBe('ˈola')
    expect(normalizeTranscription('  ')).toBeNull()
    expect(normalizeTranscription(undefined)).toBeNull()
  })
})
