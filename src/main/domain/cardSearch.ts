import { levenshtein } from '../../shared/answerCheck'
import type { Card } from '../../shared/types'

/**
 * Card search (D54). The query is split into words, and every word must be found in at least one field:
 * the card word itself, the meaning, examples with translations, or the set name. The field order is their weight:
 * a match in the card word matters more than in the meaning, and that more than in an example.
 * Ignores case, diacritics and symbols: "hold at bay" finds "hold/keep sth (sb) at bay", corazon — corazón.
 */

/** Short query words (1–2 letters) match only from the word start, otherwise "ch" would find every "which". */
const SHORT_TOKEN = 2
/** From what length one typo is forgiven: in short words an extra letter gives too many unrelated matches. */
const FUZZY_FROM = 5

const FIELD_WEIGHT = { term: 0, meaning: 10, examples: 20, set: 20 } as const
/** Within a field: the whole word, the word start, part of a word, a word with a typo. */
const EXACT = 0
const PREFIX = 1
const INSIDE = 2
const FUZZY = 3
/** The query matched the card word entirely — such a card always comes first. */
const WHOLE_TERM_BONUS = -100

/** Words of a string for comparison: no case, diacritics or symbols (sth/sb, brackets, ¿ ¡). */
export function searchWords(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** How well a query word matched one of the field words; null — no match. */
function matchLevel(token: string, words: string[]): number | null {
  let best: number | null = null
  for (const word of words) {
    let level: number | null = null
    if (word === token) level = EXACT
    else if (word.startsWith(token)) level = PREFIX
    else if (token.length > SHORT_TOKEN && word.includes(token)) level = INSIDE
    else if (
      token.length >= FUZZY_FROM &&
      (levenshtein(token, word.slice(0, token.length)) <= 1 || levenshtein(token, word) <= 1)
    ) {
      level = FUZZY
    }
    if (level !== null && (best === null || level < best)) best = level
    if (best === EXACT) break
  }
  return best
}

interface Indexed {
  card: Card
  fields: Array<{ weight: number; words: string[] }>
  term: string
}

/** Cards where every query word was found — best matches first, ties keep the original order. */
export function searchCards(cards: Card[], setNames: Map<string, string>, query: string): Card[] {
  const tokens = searchWords(query)
  if (tokens.length === 0) return cards
  const whole = tokens.join(' ')

  const indexed: Indexed[] = cards.map((card) => ({
    card,
    term: searchWords(card.term).join(' '),
    fields: [
      { weight: FIELD_WEIGHT.term, words: searchWords(card.term) },
      { weight: FIELD_WEIGHT.meaning, words: searchWords(card.meaning) },
      {
        weight: FIELD_WEIGHT.examples,
        words: card.examples.flatMap((e) => searchWords(`${e.text} ${e.translation ?? ''}`))
      },
      { weight: FIELD_WEIGHT.set, words: searchWords(card.setId ? (setNames.get(card.setId) ?? '') : '') }
    ]
  }))

  const scored: Array<{ card: Card; score: number; order: number }> = []
  indexed.forEach(({ card, fields, term }, order) => {
    let score = term === whole ? WHOLE_TERM_BONUS : 0
    for (const token of tokens) {
      let best: number | null = null
      for (const field of fields) {
        const level = matchLevel(token, field.words)
        if (level !== null && (best === null || field.weight + level < best)) best = field.weight + level
      }
      if (best === null) return
      score += best
    }
    scored.push({ card, score, order })
  })
  return scored.sort((a, b) => a.score - b.score || a.order - b.order).map((s) => s.card)
}
