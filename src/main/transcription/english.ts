import { dictionary } from 'cmu-pronouncing-dictionary'

/** ARPAbet (CMU dictionary) → IPA, American pronunciation (D22). */
const VOWELS: Record<string, string> = {
  AA: 'ɑ',
  AE: 'æ',
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'ɛ',
  EY: 'eɪ',
  IH: 'ɪ',
  IY: 'i',
  OW: 'oʊ',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'u'
}

const CONSONANTS: Record<string, string> = {
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'r',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ'
}

/** Consonant clusters an English syllable can start with: the stress mark goes before them. */
const ONSETS = new Set(
  [
    'P L', 'P R', 'B L', 'B R', 'T R', 'D R', 'K L', 'K R', 'G L', 'G R', 'F L', 'F R', 'TH R', 'SH R',
    'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S W', 'T W', 'D W', 'K W', 'G W', 'TH W',
    'S P L', 'S P R', 'S T R', 'S K R', 'S K W',
    'P Y', 'B Y', 'K Y', 'F Y', 'M Y', 'HH Y', 'V Y', 'G Y'
  ]
)

/** Dictionary abbreviations: "sb", "sth" are read as full words. */
const ABBREVIATIONS: Record<string, string> = {
  sb: 'somebody',
  smb: 'somebody',
  "sb's": "somebody's",
  sth: 'something',
  smth: 'something'
}

interface Phone {
  base: string
  stress: '0' | '1' | '2' | null
}

function parsePhones(arpabet: string): Phone[] {
  return arpabet.split(' ').map((p) => {
    const match = /^([A-Z]+)([012])?$/.exec(p)
    return { base: match?.[1] ?? p, stress: (match?.[2] as Phone['stress']) ?? null }
  })
}

function vowelIpa({ base, stress }: Phone): string {
  if (base === 'AH') return stress === '0' ? 'ə' : 'ʌ'
  if (base === 'ER') return stress === '0' ? 'ɚ' : 'ɝ'
  return VOWELS[base] ?? ''
}

const isVowel = (phone: Phone): boolean => phone.stress !== null

/** A word in ARPAbet → IPA with stress marks ˈ and ˌ (no stress mark in one-syllable words). */
export function arpabetToIpa(arpabet: string): string {
  const phones = parsePhones(arpabet)
  const marks = new Map<number, string>()
  const syllables = phones.filter(isVowel).length

  if (syllables > 1) {
    phones.forEach((phone, index) => {
      if (phone.stress !== '1' && phone.stress !== '2') return
      // Syllable onset: the longest allowed consonant group before the stressed vowel.
      let start = index
      while (start > 0 && !isVowel(phones[start - 1] as Phone)) start--
      let onset = index
      for (let i = start; i < index; i++) {
        const cluster = phones.slice(i, index).map((p) => p.base).join(' ')
        if (i === index - 1 || ONSETS.has(cluster) || i === 0) {
          onset = i
          break
        }
      }
      marks.set(onset, phone.stress === '1' ? 'ˈ' : 'ˌ')
    })
  }

  return phones
    .map((phone, index) => (marks.get(index) ?? '') + (isVowel(phone) ? vowelIpa(phone) : (CONSONANTS[phone.base] ?? '')))
    .join('')
}

const UNSTRESSED_PARTS = new Set(['of', 'the', 'a', 'an', 'to', 'in', 'on', 'and', 'or', 'for', 'at', 'by'])

/**
 * A hyphenated compound: if some part has its own primary stress, the other
 * one-syllable parts get secondary stress (ˌlaɪkˈmaɪndəd, ˌaʊtʌvˈpɑkət); if all parts
 * are one syllable — primary stress on the first (ˈskaɪˌhaɪ). Function words stay unstressed.
 */
function compoundIpa(words: string[], arpabet: string[]): string {
  const ipa = arpabet.map(arpabetToIpa)
  const hasPrimary = ipa.some((p) => p.includes('ˈ'))
  return ipa
    .map((part, i) => {
      if (/[ˈˌ]/.test(part) || UNSTRESSED_PARTS.has(words[i] ?? '')) return part
      return `${!hasPrimary && i === 0 ? 'ˈ' : 'ˌ'}${part}`
    })
    .join('')
}

function lookup(word: string): string | null {
  const key = ABBREVIATIONS[word] ?? word
  const direct = dictionary[key]
  if (direct) return arpabetToIpa(direct)
  // Hyphenated words (second-guess) — part by part.
  if (key.includes('-')) {
    const parts = key.split('-').filter(Boolean).map((part) => dictionary[part])
    if (parts.length > 0 && parts.every(Boolean)) return compoundIpa(key.split('-').filter(Boolean), parts as string[])
  }
  return null
}

/** Transcription of an English word or phrase; null if any word is not in the dictionary. */
export function transcribeEnglish(phrase: string): string | null {
  const words = phrase
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .map((w) => w.split('/')[0] ?? '')
    .map((w) => w.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, ''))
    .filter(Boolean)
  if (words.length === 0) return null

  const result: string[] = []
  words.forEach((word, index) => {
    // "used to" meaning "accustomed" is read [just], not [juzd].
    const ipa = word === 'used' && words[index + 1] === 'to' ? 'just' : lookup(word)
    result.push(ipa ?? '')
  })
  return result.includes('') ? null : result.join(' ')
}
