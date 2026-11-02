import enData from 'emojibase-data/en/compact.json'
import esData from 'emojibase-data/es/compact.json'
import ruData from 'emojibase-data/ru/compact.json'
import type { SpaceId } from '../../shared/types'

/**
 * Offline emoji association (D27): by emoji names and tags from emojibase
 * in English, Russian and Spanish. It is a rough heuristic — the user can always
 * choose another; a more accurate pick would come with AI in MVP-6.
 */

type Lang = 'en' | 'ru' | 'es'

interface CompactEmoji {
  unicode: string
  label: string
  tags?: string[]
  group?: number
  order?: number
}

/** emojibase groups: 2 — components (skin tones etc.), 9 — flags; not used for associations. */
const EXCLUDED_GROUPS = new Set([2, 9])

const STOPWORDS: Record<Lang, Set<string>> = {
  en: new Set(
    'a an the to of in on at for with and or but be is are was were been your you yours someone somebody something sth sb smb one one\'s it its that this these those as by from into up out off not no do does did very more most so than then there their them they he she his her we our us i me my get got have has had about over'.split(
      ' '
    )
  ),
  // Russian stop words: the user's meanings are in Russian, so emoji are matched in Russian too.
  ru: new Set(
    'и в во на с со к ко по за от до для не ни что как это то быть был была были его её ее их чем при из у о об а но или же ли бы кто чего кого-либо что-либо чему-либо кому-либо чем-либо свой своей свою'.split(
      ' '
    )
  ),
  es: new Set('el la los las un una unos unos de del a al en con por para que y o e ni no se lo le su sus es ser muy mi tu te me hasta'.split(' '))
}

interface Index {
  /** Word → emoji with a weight: a name match weighs more than a tag match. */
  words: Map<string, Map<string, number>>
}

const ORDER = new Map<string, number>()

function normalize(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Russian "yo" is often typed as "ye": treat them as the same letter.
    .replace(/ё/g, 'е')
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length >= 3)
}

function buildIndex(data: CompactEmoji[]): Index {
  const words = new Map<string, Map<string, number>>()
  const add = (word: string, emoji: string, weight: number) => {
    const entry = words.get(word) ?? new Map<string, number>()
    entry.set(emoji, Math.max(entry.get(emoji) ?? 0, weight))
    words.set(word, entry)
  }
  for (const item of data) {
    if (item.group !== undefined && EXCLUDED_GROUPS.has(item.group)) continue
    if (!ORDER.has(item.unicode)) ORDER.set(item.unicode, item.order ?? Number.MAX_SAFE_INTEGER)
    for (const word of tokens(item.label)) add(word, item.unicode, 1.5)
    for (const tag of item.tags ?? []) for (const word of tokens(tag)) add(word, item.unicode, 1)
  }
  return { words }
}

let indexes: Record<Lang, Index> | null = null
function getIndexes(): Record<Lang, Index> {
  indexes ??= {
    en: buildIndex(enData as CompactEmoji[]),
    ru: buildIndex(ruData as CompactEmoji[]),
    es: buildIndex(esData as CompactEmoji[])
  }
  return indexes
}

/** Simple endings (English, Spanish): drives → drive, making → make, casas → casa. */
function stems(token: string, lang: Lang): string[] {
  if (lang === 'ru') return [token]
  const out = [token]
  for (const suffix of lang === 'en' ? ['ing', 'ed', 'es', 's', 'ly'] : ['es', 's']) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) out.push(token.slice(0, -suffix.length))
  }
  if (lang === 'en') {
    if (token.endsWith('ing') && token.length > 5) out.push(`${token.slice(0, -3)}e`)
    // Doubled consonant: trapped → trap, running → run.
    for (const stem of [...out]) if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.push(stem.slice(0, -1))
  }
  return out
}

/** Index keys for a word: an exact match or a stem; for Russian — a common start (cases). */
function matches(index: Index, token: string, lang: Lang): Array<[Map<string, number>, number]> {
  const found: Array<[Map<string, number>, number]> = []
  stems(token, lang).forEach((stem, i) => {
    const emojis = index.words.get(stem)
    if (emojis) found.push([emojis, i === 0 ? 1 : 0.9])
  })
  if (found.length === 0 && lang === 'ru' && token.length >= 5) {
    const stem = token.slice(0, Math.max(4, token.length - 2))
    for (const [key, emojis] of index.words) if (key.length >= 4 && key.startsWith(stem)) found.push([emojis, 0.6])
  }
  return found
}

function scoreText(text: string, langs: Lang[], weight: number, scores: Map<string, number>): void {
  const all = getIndexes()
  for (const lang of langs) {
    for (const token of tokens(text)) {
      if (STOPWORDS[lang].has(token)) continue
      for (const [emojis, strength] of matches(all[lang], token, lang)) {
        // Words like good or small fit dozens of emoji and say almost nothing.
        const specificity = 1 / Math.sqrt(emojis.size)
        for (const [emoji, w] of emojis) {
          scores.set(emoji, (scores.get(emoji) ?? 0) + weight * strength * w * specificity)
        }
      }
    }
  }
}

function textLangs(text: string, spaceId: SpaceId): Lang[] {
  // Cyrillic text means a Russian meaning.
  if (/[а-яё]/i.test(text)) return ['ru']
  return spaceId === 'en' ? ['en'] : ['es', 'en']
}

function ranked(scores: Map<string, number>, limit: number): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (ORDER.get(a[0]) ?? 0) - (ORDER.get(b[0]) ?? 0))
    .slice(0, limit)
    .map(([emoji]) => emoji)
}

/** Threshold of a confident association: below it, better no emoji than a random one. */
const MIN_SCORE = 1.2

function collectScores(term: string, meaning: string, spaceId: SpaceId, scores: Map<string, number>): void {
  // In idioms single words are misleading (go the extra mile is not about space), so for phrases the meaning matters more.
  const isPhrase = term.trim().split(/\s+/).length > 1
  scoreText(term, spaceId === 'en' ? ['en'] : ['es'], isPhrase ? 0.7 : 2, scores)
  // Explanations in parentheses are often in another language: a Russian word followed by "(someone who does something for fun)".
  for (const part of meaning.split(/[();,/]/)) scoreText(part, textLangs(part, spaceId), 1.6, scores)
}

/** Emoji options to choose from in the editor, best first. */
export function suggestEmojis(term: string, meaning: string, spaceId: SpaceId, limit = 8): string[] {
  const scores = new Map<string, number>()
  collectScores(term, meaning, spaceId, scores)
  return ranked(scores, limit)
}

/** The best emoji, or null if there is no confident association. */
export function suggestEmoji(term: string, meaning: string, spaceId: SpaceId): string | null {
  const scores = new Map<string, number>()
  collectScores(term, meaning, spaceId, scores)
  const [best] = ranked(scores, 1)
  return best !== undefined && (scores.get(best) ?? 0) >= MIN_SCORE ? best : null
}

/** Emoji search for manual choice: by name and tags in all three languages. */
export function searchEmojis(query: string, limit = 48): string[] {
  const scores = new Map<string, number>()
  const q = query.trim()
  if (!q) return []
  const all = getIndexes()
  for (const lang of ['en', 'ru', 'es'] as const) {
    for (const token of tokens(q)) {
      for (const [key, emojis] of all[lang].words) {
        if (!key.startsWith(token)) continue
        const strength = key === token ? 1 : 0.7
        for (const [emoji, w] of emojis) scores.set(emoji, Math.max(scores.get(emoji) ?? 0, strength * w))
      }
    }
  }
  return ranked(scores, limit)
}
