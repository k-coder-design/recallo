import type { Grade, SpaceId } from './types'

/** Вердикт проверки введённого ответа (MVP-8, D50). almost — одна опечатка, засчитывается как верный. */
export type AnswerVerdict = 'correct' | 'almost' | 'wrong' | 'empty'

/** Часть сравнения: совпало, лишнее/неверное у пользователя или пропущенное из ответа. */
export interface DiffPart {
  text: string
  kind: 'same' | 'wrong' | 'missing'
}

export interface AnswerCheck {
  verdict: AnswerVerdict
  /** Что ввёл пользователь, как есть. */
  typed: string
  /** Вариант ответа, ближайший к введённому, — в исходном написании карточки. */
  expected: string
  /** Посимвольное сравнение введённого с ожидаемым (для almost и wrong). */
  diff: DiffPart[]
  /** Оценка, которую предлагает приложение; пользователь может выбрать другую. */
  suggestedGrade: Grade
}

const MAX_VARIANTS = 32
/** С какой длины ответа прощается одна опечатка. */
const TYPO_MIN_LENGTH = 5
const LEADING_ARTICLE: Partial<Record<SpaceId, RegExp>> = { en: /^(to|a|an|the) / }
/** Словарные сокращения и синонимы-заглушки: sth = something, sb = someone = somebody. */
const EQUIVALENTS: Array<[RegExp, string]> = [
  [/\bsth\b/g, 'something'],
  [/\bsb\b/g, 'somebody'],
  [/\bsomeone\b/g, 'somebody']
]

const foldChar = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Форма для сравнения: без регистра, диакритики, пунктуации и начального артикля. */
export function normalizeAnswer(value: string, spaceId: SpaceId): string {
  let result = [...value].map(foldChar).join('')
  // Сначала замены (sb's → somebody's), потом апострофы: иначе «sbs» уже не узнать.
  result = result.replace(/[^\p{L}\p{N}'’`]+/gu, ' ')
  for (const [pattern, word] of EQUIVALENTS) result = result.replace(pattern, word)
  result = result.replace(/['’`]/g, '').replace(/\s+/g, ' ').trim()
  const article = LEADING_ARTICLE[spaceId]
  return article ? result.replace(article, '') : result
}

/**
 * Допустимые ответы карточки: варианты через « / », слэш внутри фразы (hold/keep — любое из слов),
 * необязательные части в скобках и списки «disaster, trouble, success, etc.» — любой пункт.
 */
export function answerVariants(term: string): string[] {
  // Сама фраза целиком (со слэшами и запятыми) тоже верный ответ.
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

/** Расстояние Левенштейна: сколько вставок, удалений и замен отделяют одну строку от другой. */
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

/** Посимвольное выравнивание: что из введённого совпало, что лишнее и чего не хватает. */
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
  // Обход с конца; при равной стоимости пропуск и лишнее ставятся правее (reckles → reckles + «s»).
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
 * Подсветка разницы полезна, только когда ответ близок (опечатка, пара ошибок). Совсем другой ответ
 * посимвольно не сравнивается — получилась бы каша; он показывается целиком как неверный.
 */
function diffFor(verdict: AnswerVerdict, typed: string, expected: string, distance: number, length: number): DiffPart[] {
  if (verdict === 'correct' || verdict === 'empty') return []
  if (verdict === 'almost' || distance <= Math.max(2, Math.floor(length / 3))) return diffAnswer(typed, expected)
  return [{ text: typed, kind: 'wrong' }]
}

/** Проверяет введённый ответ против слова карточки. Окончательную оценку выбирает пользователь. */
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
