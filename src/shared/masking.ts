import type { Segment, SpaceId } from './types'

const WORD_CHAR = /[\p{L}\p{N}]/u
const NOT_AFTER_WORD = '(?<![\\p{L}\\p{N}])'
const NOT_BEFORE_WORD = '(?![\\p{L}\\p{N}])'
const APOSTROPHE = /['’]/g
/** An arbitrary example word that fills a placeholder like someone/something. */
const ANY_WORD = "[\\p{L}\\p{N}'’-]+"
/** One to three words: "someone" → "her", "the new project", "his parents'". */
const ANY_PHRASE = `${ANY_WORD}(?:\\s+${ANY_WORD}){0,2}?`

interface LanguageRules {
  suffixes: string[]
  /** Words that do not inflect: prepositions, articles, conjunctions. */
  fixed: Set<string>
  articles: string[]
  /** Placeholders in the expression itself: any word or phrase stands in their place in an example. */
  placeholders: Set<string>
  possessives: Set<string>
  reflexives: Set<string>
}

const EN: LanguageRules = {
  suffixes: ['ing', "'s", 'es', 'ed', 's', 'd'],
  fixed: new Set(
    'a an the of to in on at for with from into onto up out off and or but by about down over through as than so not no'.split(' ')
  ),
  articles: ['a', 'an', 'the'],
  placeholders: new Set(
    "someone somebody sb smb something sth smth someone's somebody's sb's smb's".split(' ')
  ),
  possessives: new Set(["your", "one's"]),
  reflexives: new Set(['yourself', 'oneself'])
}

const ES: LanguageRules = {
  suffixes: ['es', 's'],
  fixed: new Set('el la los las un una unos unas de del a al en con por para que y o e ni sin sobre'.split(' ')),
  articles: ['el', 'la', 'los', 'las', 'un', 'una'],
  placeholders: new Set(['alguien', 'algo']),
  possessives: new Set(['su']),
  reflexives: new Set()
}

const RULES: Record<SpaceId, LanguageRules> = { en: EN, es: ES }

const EN_POSSESSIVES = ['my', 'your', 'his', 'her', 'its', 'our', 'their', "one's"]
const EN_REFLEXIVES = ['myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves', 'oneself']
const ES_POSSESSIVES = ['mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros', 'nuestras']
const BE_FORMS = ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being']

/** Common irregular verbs: forms that cannot be made with endings. */
const EN_IRREGULAR: Record<string, string[]> = {
  be: BE_FORMS,
  become: ['became'],
  begin: ['began', 'begun'],
  break: ['broke', 'broken'],
  bring: ['brought'],
  build: ['built'],
  buy: ['bought'],
  catch: ['caught'],
  choose: ['chose', 'chosen'],
  come: ['came'],
  do: ['did', 'done', 'does'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  fall: ['fell', 'fallen'],
  feel: ['felt'],
  find: ['found'],
  forget: ['forgot', 'forgotten'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone', 'goes'],
  have: ['has', 'had'],
  hear: ['heard'],
  hold: ['held'],
  keep: ['kept'],
  know: ['knew', 'known'],
  lay: ['laid'],
  leave: ['left'],
  lose: ['lost'],
  make: ['made'],
  mean: ['meant'],
  meet: ['met'],
  pay: ['paid'],
  ride: ['rode', 'ridden'],
  say: ['said'],
  see: ['saw', 'seen'],
  sell: ['sold'],
  send: ['sent'],
  speak: ['spoke', 'spoken'],
  spend: ['spent'],
  stand: ['stood'],
  steal: ['stole', 'stolen'],
  stick: ['stuck'],
  take: ['took', 'taken'],
  teach: ['taught'],
  tell: ['told'],
  think: ['thought'],
  throw: ['threw', 'thrown'],
  understand: ['understood'],
  wear: ['wore', 'worn'],
  win: ['won'],
  write: ['wrote', 'written']
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(APOSTROPHE, "['’]")
}

const alternatives = (options: string[]): string => `(?:${options.join('|')})`
const literal = (words: string[]): string => alternatives(words.map(escapeRegExp))

const ACCENT_CLASSES: Record<string, string> = {
  a: '[aá]',
  á: '[aá]',
  e: '[eé]',
  é: '[eé]',
  i: '[ií]',
  í: '[ií]',
  o: '[oó]',
  ó: '[oó]',
  u: '[uúü]',
  ú: '[uúü]',
  ü: '[uúü]'
}

/** In Spanish the accent is often skipped when typing: "como" should find "cómo". */
function foldAccents(pattern: string, spaceId: SpaceId): string {
  if (spaceId !== 'es') return pattern
  return pattern.replace(/[aáeéiíoóuúü]/giu, (ch) => ACCENT_CLASSES[ch.toLowerCase()] ?? ch)
}

/** Edge punctuation ("¡Hasta luego!") may differ in an example: "¡Hasta luego, amigos!". */
const EDGE_PUNCTUATION = /^[\s¡¿!?.,;:…"«»“”]+|[\s¡¿!?.,;:…"«»“”]+$/gu

/** "Mucho gusto / un gusto" — several equal variants of the expression. */
function termVariants(term: string): string[] {
  return term
    .split(/\s+\/\s+/)
    .map((variant) => variant.replace(EDGE_PUNCTUATION, ''))
    .filter(Boolean)
}

/** All forms of one word of the expression: endings, stem changes, irregular forms. */
function wordForms(word: string, spaceId: SpaceId): string {
  const lower = word.toLowerCase()
  const rules = RULES[spaceId]
  const base = foldAccents(escapeRegExp(word), spaceId)
  if (rules.fixed.has(lower) || !WORD_CHAR.test(word[word.length - 1] ?? '')) return base

  const forms = [`${base}${literal(rules.suffixes)}?`]
  if (spaceId === 'en') {
    const vowels = 'aeiou'
    const last = lower[lower.length - 1] ?? ''
    const beforeLast = lower[lower.length - 2] ?? ''
    if (lower.length >= 2 && !vowels.includes(last) && !'wxy'.includes(last) && vowels.includes(beforeLast)) {
      forms.push(`${base}${escapeRegExp(word.slice(-1))}${literal(['ing', 'ed', 'er'])}`)
    }
    if (last === 'e') forms.push(`${escapeRegExp(word.slice(0, -1))}ing`)
    if (last === 'y' && !vowels.includes(beforeLast)) forms.push(`${escapeRegExp(word.slice(0, -1))}${literal(['ies', 'ied'])}`)
    const irregular = EN_IRREGULAR[lower]
    if (irregular) forms.push(...irregular.map(escapeRegExp))
  }
  return alternatives(forms)
}

type Token = { kind: 'word'; options: string[] } | { kind: 'optional'; tokens: Token[] }

/** "hold/keep sth (sb) at bay" → words with variants and optional groups in parentheses. */
function tokenize(phrase: string): Token[] {
  const tokens: Token[] = []
  for (const part of phrase.split(/(\([^)]*\))/)) {
    if (part.startsWith('(') && part.endsWith(')')) {
      const inner = tokenize(part.slice(1, -1))
      if (inner.length > 0) tokens.push({ kind: 'optional', tokens: inner })
      continue
    }
    for (const word of part.trim().split(/\s+/).filter(Boolean)) {
      tokens.push({ kind: 'word', options: word.split('/').filter(Boolean) })
    }
  }
  return tokens
}

const isPlaceholder = (token: Token | undefined, rules: LanguageRules): boolean =>
  token?.kind === 'word' && token.options.every((o) => rules.placeholders.has(o.toLowerCase()))

function wordPattern(word: string, spaceId: SpaceId, position: number): string {
  const lower = word.toLowerCase()
  const rules = RULES[spaceId]
  const boundary = WORD_CHAR.test(word[0] ?? '') ? NOT_AFTER_WORD : ''

  if (rules.placeholders.has(lower)) return ANY_PHRASE
  if (rules.possessives.has(lower)) {
    return NOT_AFTER_WORD + literal(spaceId === 'en' ? EN_POSSESSIVES : ES_POSSESSIVES)
  }
  if (rules.reflexives.has(lower)) return NOT_AFTER_WORD + literal(EN_REFLEXIVES)
  // An article inside the expression can be any: settle an account → settle the account.
  if (position > 0 && rules.articles.includes(lower)) return NOT_AFTER_WORD + literal(rules.articles)
  return boundary + wordForms(word, spaceId)
}

function tokensPattern(tokens: Token[], spaceId: SpaceId): string {
  const parts: string[] = []
  tokens.forEach((token, index) => {
    if (token.kind === 'optional') {
      parts.push(`(?:\\s+${tokensPattern(token.tokens, spaceId)})?`)
      return
    }
    const options = token.options.map((o) => wordPattern(o, spaceId, index))
    const pattern = options.length === 1 ? (options[0] ?? '') : alternatives(options)
    parts.push(parts.length === 0 ? pattern : `\\s+${pattern}`)
  })
  // The first group may turn out optional: then it needs no separating space.
  return parts.join('').replace(/^\(\?:\\s\+/, '(?:')
}

/** A regular expression for the studied expression with all its forms. */
function buildTermPattern(term: string, spaceId: SpaceId): string | null {
  const rules = RULES[spaceId]
  const tokens = tokenize(term)

  // Placeholders at the edges are not part of the expression: "read up on something" hides "read up on".
  while (isPlaceholder(tokens[0], rules)) tokens.shift()
  while (isPlaceholder(tokens[tokens.length - 1], rules)) tokens.pop()
  if (tokens.length === 0) return null

  // A function-word start is optional: to imply → implied, a rat race → the rat race, be likely → are likely.
  let prefix = ''
  const first = tokens[0]
  const firstWord = first?.kind === 'word' && first.options.length === 1 ? first.options[0]?.toLowerCase() : undefined
  if (tokens.length > 1 && firstWord) {
    if (spaceId === 'en' && firstWord === 'to') {
      tokens.shift()
      prefix = `(?:${NOT_AFTER_WORD}to\\s+)?`
    } else if (rules.articles.includes(firstWord)) {
      tokens.shift()
      prefix = `(?:${NOT_AFTER_WORD}${literal(rules.articles)}\\s+)?`
    } else if (spaceId === 'en' && firstWord === 'be') {
      tokens.shift()
      prefix = `(?:(?:${NOT_AFTER_WORD}${literal(BE_FORMS)}|['’](?:m|s|re))\\s+)?`
    }
  }

  const body = tokensPattern(tokens, spaceId)
  const last = term.trim()[term.trim().length - 1] ?? ''
  return prefix + body + (WORD_CHAR.test(last) || last === ')' ? NOT_BEFORE_WORD : '')
}

/** An explicit example fragment is hidden verbatim (CARD-09). */
function buildFragmentPattern(fragment: string): string | null {
  const words = fragment.trim().split(/\s+/).filter(Boolean)
  const first = words[0]
  const last = words[words.length - 1]
  if (!first || !last) return null
  const start = WORD_CHAR.test(first[0] ?? '') ? NOT_AFTER_WORD : ''
  const end = WORD_CHAR.test(last[last.length - 1] ?? '') ? NOT_BEFORE_WORD : ''
  return start + words.map(escapeRegExp).join('\\s+') + end
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: Array<[number, number]> = []
  for (const [start, end] of sorted) {
    const prev = merged[merged.length - 1]
    if (prev && start <= prev[1]) prev[1] = Math.max(prev[1], end)
    else merged.push([start, end])
  }
  return merged
}

/** Example ranges to hide: all occurrences of the expression and explicit fragments (CARD-07…09). */
export function findMaskRanges(
  text: string,
  term: string,
  fragments: readonly string[],
  spaceId: SpaceId
): Array<[number, number]> {
  const patterns = [
    ...termVariants(term).map((variant) => buildTermPattern(variant, spaceId)),
    ...fragments.map(buildFragmentPattern)
  ]
  const ranges: Array<[number, number]> = []
  for (const pattern of patterns) {
    if (!pattern) continue
    for (const match of text.matchAll(new RegExp(pattern, 'giu'))) {
      // A space captured by an optional part is not hidden.
      const value = match[0]
      const start = match.index + (value.length - value.trimStart().length)
      const end = match.index + value.trimEnd().length
      if (end > start) ranges.push([start, end])
    }
  }
  return mergeRanges(ranges)
}

/** Splits an example into segments; hidden ones are marked masked. */
export function maskExample(
  text: string,
  term: string,
  fragments: readonly string[],
  spaceId: SpaceId
): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const [start, end] of findMaskRanges(text, term, fragments, spaceId)) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), masked: false })
    segments.push({ text: text.slice(start, end), masked: true })
    cursor = end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), masked: false })
  return segments
}

/** Removes the text of hidden segments so the answer does not reach the front side. */
export function hideMasked(segments: readonly Segment[]): Segment[] {
  return segments.map((s) => (s.masked ? { text: '', masked: true } : s))
}

/** Whether the text contains the studied expression — for the warning about a hint in the meaning. */
export function containsTerm(text: string, term: string, spaceId: SpaceId): boolean {
  return findMaskRanges(text, term, [], spaceId).length > 0
}
