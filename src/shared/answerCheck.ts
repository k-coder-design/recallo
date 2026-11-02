import type { Grade, SpaceId } from './types'

/** Verdict of a typed answer check (MVP-8, D50). almost — one typo, counted as correct. */
export type AnswerVerdict = 'correct' | 'almost' | 'wrong' | 'empty'

/** A part of the comparison: matched, extra/wrong in the user's input, or missing from the answer. */
export interface DiffPart {
  text: string
  kind: 'same' | 'wrong' | 'missing'
}

export interface AnswerCheck {
  verdict: AnswerVerdict
  /** What the user typed, as is. */
  typed: string
  /** The answer variant closest to the input — in the card's original spelling. */
  expected: string
  /** Character-by-character comparison of the input with the expected answer (for almost and wrong). */
  diff: DiffPart[]
  /** The grade the app suggests; the user may choose another. */
  suggestedGrade: Grade
}

const MAX_VARIANTS = 32
/** From what answer length one typo is forgiven. */
const TYPO_MIN_LENGTH = 5
const LEADING_ARTICLE: Partial<Record<SpaceId, RegExp>> = { en: /^(to|a|an|the) / }
/** Dictionary abbreviations and placeholder synonyms: sth = something, sb = someone = somebody. */
const EQUIVALENTS: Array<[RegExp, string]> = [
  [/\bsth\b/g, 'something'],
  [/\bsb\b/g, 'somebody'],
  [/\bsomeone\b/g, 'somebody']
]

const foldChar = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The form for comparison: no case, diacritics, punctuation or leading article. */
export function normalizeAnswer(value: string, spaceId: SpaceId): string {
  let result = [...value].map(foldChar).join('')
  // Replacements first (sb's → somebody's), then apostrophes: otherwise "sbs" can no longer be recognized.
  result = result.replace(/[^\p{L}\p{N}'’`]+/gu, ' ')
  for (const [pattern, word] of EQUIVALENTS) result = result.replace(pattern, word)
  result = result.replace(/['’`]/g, '').replace(/\s+/g, ' ').trim()
  const article = LEADING_ARTICLE[spaceId]
  return article ? result.replace(article, '') : result
}

/**
 * Accepted answers for a card: variants split by " / ", a slash inside a phrase (hold/keep — either word),
 * optional parts in parentheses and lists "disaster, trouble, success, etc." — any item.
 */
export function answerVariants(term: string): string[] {
  // The whole phrase (with slashes and commas) is also a correct answer.
  const variants = new Set<string>([term.trim()])
  for (const alternative of term.split(/\s+\/\s+/)) {
    variants.add(alternative.trim())
    for (const listed of expandEtc(alternative.trim())) {
      for (const bracketed of expandParentheses(listed)) {
        for (const slashed of expandSlashes(bracketed)) {
          variants.add(slashed.replace(/\s+/g, ' ').trim())
          if (variants.size >= MAX_VARIANTS) return [...variants]
        }
      }
    }
  }
  return [...variants].filter(Boolean)
}

function expandEtc(value: string): string[] {
  const match = /^(.*),\s*etc\.?$/i.exec(value)
  if (!match) return [value]
  const [first = '', ...rest] = (match[1] ?? '').split(/\s*,\s*/)
  const prefix = first.includes(' ') ? first.slice(0, first.lastIndexOf(' ') + 1) : ''
  return [first, ...rest.map((item) => `${prefix}${item}`)]
}

function expandParentheses(value: string): string[] {
  if (!/\([^)]*\)/.test(value)) return [value]
  return [value.replace(/[()]/g, ''), value.replace(/\s*\([^)]*\)\s*/g, ' ')]
}

function expandSlashes(value: string): string[] {
  let results = ['']
  for (const token of value.split(/(\s+)/)) {
    const options = /\p{L}\/\p{L}/u.test(token) ? token.split('/') : [token]
    results = results.flatMap((prefix) => options.map((option) => prefix + option)).slice(0, MAX_VARIANTS)
  }
  return results
}

/** Levenshtein distance: how many insertions, deletions and substitutions separate two strings. */
export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] as number
      row[j] = Math.min((row[j] as number) + 1, (row[j - 1] as number) + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length] as number
}

/** Character alignment: what of the input matched, what is extra and what is missing. */
export function diffAnswer(typed: string, expected: string): DiffPart[] {
  const a = [...typed]
  const b = [...expected]
  const same = (i: number, j: number) => foldChar(a[i] as string) === foldChar(b[j] as string)
  const cost: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cost[i]![j] = Math.min(cost[i - 1]![j]! + 1, cost[i]![j - 1]! + 1, cost[i - 1]![j - 1]! + (same(i - 1, j - 1) ? 0 : 1))
    }
  }
  const parts: DiffPart[] = []
  const push = (text: string, kind: DiffPart['kind']) => {
    const last = parts[0]
    if (last && last.kind === kind) last.text = text + last.text
    else parts.unshift({ text, kind })
  }
  let i = a.length
  let j = b.length
  // Walk from the end; at equal cost, missing and extra go further right (reckles → reckles + "s").
  while (i > 0 || j > 0) {
    if (j > 0 && cost[i]![j] === cost[i]![j - 1]! + 1) {
      push(b[j - 1] as string, 'missing')
      j--
    } else if (i > 0 && cost[i]![j] === cost[i - 1]![j]! + 1) {
      push(a[i - 1] as string, 'wrong')
      i--
    } else {
      if (same(i - 1, j - 1)) push(a[i - 1] as string, 'same')
      else {
        push(b[j - 1] as string, 'missing')
        push(a[i - 1] as string, 'wrong')
      }
      i--
      j--
    }
  }
  return parts
}

/**
 * Highlighting the difference is useful only when the answer is close (a typo, a couple of mistakes). A completely
 * different answer is not compared character by character — it would be a mess; it is shown whole as wrong.
 */
function diffFor(verdict: AnswerVerdict, typed: string, expected: string, distance: number, length: number): DiffPart[] {
  if (verdict === 'correct' || verdict === 'empty') return []
  if (verdict === 'almost' || distance <= Math.max(2, Math.floor(length / 3))) return diffAnswer(typed, expected)
  return [{ text: typed, kind: 'wrong' }]
}

/** Checks the typed answer against the card word. The user chooses the final grade. */
export function checkAnswer(typed: string, term: string, spaceId: SpaceId): AnswerCheck {
  const variants = answerVariants(term)
  const answer = normalizeAnswer(typed, spaceId)
  const scored = variants.map((variant) => ({ variant, distance: levenshtein(answer, normalizeAnswer(variant, spaceId)) }))
  const best = scored.reduce((a, b) => (b.distance < a.distance ? b : a), scored[0] ?? { variant: term, distance: Infinity })
  const target = normalizeAnswer(best.variant, spaceId)

  let verdict: AnswerVerdict
  if (!answer) verdict = 'empty'
  else if (best.distance === 0) verdict = 'correct'
  else if (best.distance === 1 && target.length >= TYPO_MIN_LENGTH) verdict = 'almost'
  else verdict = 'wrong'

  return {
    verdict,
    typed: typed.trim(),
    expected: best.variant,
    diff: diffFor(verdict, typed.trim(), best.variant, best.distance, target.length),
    suggestedGrade: verdict === 'correct' || verdict === 'almost' ? 'remembered' : 'forgot'
  }
}
