import { levenshtein } from '../../shared/answerCheck'
import type { Card } from '../../shared/types'

/**
 * Поиск карточек (D54). Запрос делится на слова, и каждое слово должно найтись хотя бы в одном поле:
 * в самом слове карточки, значении, примерах с переводами или названии набора. Порядок полей — их вес:
 * совпадение в слове карточки важнее, чем в значении, а оно — важнее, чем в примере.
 * Без регистра, диакритики и знаков: «hold at bay» находит «hold/keep sth (sb) at bay», corazon — corazón.
 */

/** Короткие слова запроса (1–2 буквы) ищутся только с начала слова, иначе «ch» найдёт каждое «which». */
const SHORT_TOKEN = 2
/** С какой длины прощается одна опечатка: в коротких словах лишняя буква даёт слишком много чужих совпадений. */
const FUZZY_FROM = 5

const FIELD_WEIGHT = { term: 0, meaning: 10, examples: 20, set: 20 } as const
/** Внутри поля: слово целиком, начало слова, часть слова, слово с опечаткой. */
const EXACT = 0
const PREFIX = 1
const INSIDE = 2
const FUZZY = 3
/** Запрос совпал со словом карточки целиком — такая карточка всегда первая. */
const WHOLE_TERM_BONUS = -100

/** Слова строки для сравнения: без регистра, диакритики и знаков (sth/sb, скобки, ¿ ¡). */
export function searchWords(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Насколько хорошо слово запроса совпало с одним из слов поля; null — не совпало. */
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

/** Карточки, где нашлось каждое слово запроса, — лучшие совпадения первыми, при равенстве — исходный порядок. */
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
