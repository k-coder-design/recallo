/**
 * Spanish transcription by reading rules, two variants (D22, D44):
 * - es-AR, Rioplatense: ll and y before a vowel → [ʃ], c(e/i) and z → [s];
 * - es-ES, Castilian: ll and y before a vowel → [ʝ], c(e/i) and z → [θ].
 * Broad (phonological) notation without the allophones β ð ɣ.
 */

export type SpanishVariant = 'es-AR' | 'es-ES'

interface VariantRules {
  /** ll and y before a vowel. */
  palatal: string
  /** c before e/i, and z. */
  sibilant: string
}

const VARIANTS: Record<SpanishVariant, VariantRules> = {
  'es-AR': { palatal: 'ʃ', sibilant: 's' },
  'es-ES': { palatal: 'ʝ', sibilant: 'θ' }
}

interface Segment {
  ipa: string
  vowel: boolean
  /** A strong vowel (a, e, o or accented): forms its own syllable. */
  strong: boolean
  accented: boolean
  /** Final y (muy, hoy): always a glide, never syllabic. */
  glide?: boolean
}

const VOWEL_MAP: Record<string, { ipa: string; strong: boolean; accented: boolean }> = {
  a: { ipa: 'a', strong: true, accented: false },
  e: { ipa: 'e', strong: true, accented: false },
  o: { ipa: 'o', strong: true, accented: false },
  i: { ipa: 'i', strong: false, accented: false },
  u: { ipa: 'u', strong: false, accented: false },
  ü: { ipa: 'u', strong: false, accented: false },
  á: { ipa: 'a', strong: true, accented: true },
  é: { ipa: 'e', strong: true, accented: true },
  ó: { ipa: 'o', strong: true, accented: true },
  í: { ipa: 'i', strong: true, accented: true },
  ú: { ipa: 'u', strong: true, accented: true }
}

const FRONT = new Set(['e', 'i', 'é', 'í'])
const SIMPLE: Record<string, string> = {
  b: 'b', d: 'd', f: 'f', k: 'k', l: 'l', m: 'm', n: 'n', p: 'p', s: 's', t: 't', v: 'b', j: 'x', ñ: 'ɲ', w: 'w'
}
/** Inseparable clusters: a consonant + l/ɾ go into one syllable (pla-to, ha-blar). */
const CLUSTER_FIRST = new Set(['p', 'b', 'f', 't', 'd', 'k', 'ɡ'])
const CLUSTER_SECOND = new Set(['l', 'ɾ'])

const consonant = (ipa: string): Segment => ({ ipa, vowel: false, strong: false, accented: false })

function segment(word: string, rules: VariantRules): Segment[] {
  const chars = [...word]
  const out: Segment[] = []
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string
    const next = chars[i + 1] ?? ''
    const afterNext = chars[i + 2] ?? ''
    const vowel = VOWEL_MAP[c]

    if (vowel) out.push({ ...vowel, vowel: true })
    else if (c === 'c' && next === 'h') {
      out.push(consonant('tʃ'))
      i++
    } else if (c === 'l' && next === 'l') {
      out.push(consonant(rules.palatal))
      i++
    } else if (c === 'r' && next === 'r') {
      out.push(consonant('r'))
      i++
    } else if (c === 'q' && next === 'u') {
      out.push(consonant('k'))
      i++
    } else if (c === 'g' && next === 'u' && FRONT.has(afterNext)) {
      out.push(consonant('ɡ'))
      i++
    } else if (c === 'c') out.push(consonant(FRONT.has(next) ? rules.sibilant : 'k'))
    else if (c === 'z') out.push(consonant(rules.sibilant))
    else if (c === 'g') out.push(consonant(FRONT.has(next) ? 'x' : 'ɡ'))
    else if (c === 'h') continue
    else if (c === 'x') {
      out.push(consonant('k'), consonant('s'))
      // excelente: xc before e/i reads [ks], not [kss].
      if (next === 'c' && FRONT.has(afterNext)) i++
    } else if (c === 'y') {
      // Before a vowel y is a consonant (like ll); after a vowel (muy, hoy) — a glide; alone (y) — the vowel i.
      if (VOWEL_MAP[next]) out.push(consonant(rules.palatal))
      else out.push({ ipa: 'i', vowel: true, strong: false, accented: false, glide: out.length > 0 && out[out.length - 1]?.vowel === true })
    } else if (c === 'r') {
      const prev = out[out.length - 1]
      const trill = i === 0 || (prev !== undefined && ['l', 'n', 's'].includes(prev.ipa))
      out.push(consonant(trill ? 'r' : 'ɾ'))
    } else if (SIMPLE[c]) out.push(consonant(SIMPLE[c] as string))
  }
  return out
}

interface Syllable {
  segments: Segment[]
  accented: boolean
}

/** Splits a word into syllables: diphthongs (a weak i/u next to a vowel) stay in one syllable. */
function syllabify(segments: Segment[]): Syllable[] {
  // Nuclei: consecutive vowels, split between two strong ones.
  const nuclei: Array<[number, number]> = []
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i]?.vowel) continue
    let end = i
    while (segments[end + 1]?.vowel && !((segments[end] as Segment).strong && (segments[end + 1] as Segment).strong)) end++
    nuclei.push([i, end])
    i = end
  }
  if (nuclei.length === 0) return [{ segments, accented: false }]

  const boundaries: number[] = [0]
  for (let n = 1; n < nuclei.length; n++) {
    const prevEnd = (nuclei[n - 1] as [number, number])[1]
    const start = (nuclei[n] as [number, number])[0]
    const consonants = segments.slice(prevEnd + 1, start).map((s) => s.ipa)
    let take = Math.min(consonants.length, 1)
    if (consonants.length >= 2) {
      const a = consonants[consonants.length - 2] as string
      const b = consonants[consonants.length - 1] as string
      if (CLUSTER_FIRST.has(a) && CLUSTER_SECOND.has(b) && !(a === 'd' && b === 'l')) take = 2
    }
    boundaries.push(start - take)
  }
  boundaries.push(segments.length)

  const syllables: Syllable[] = []
  for (let b = 0; b < boundaries.length - 1; b++) {
    const part = segments.slice(boundaries[b], boundaries[b + 1])
    syllables.push({ segments: part, accented: part.some((s) => s.accented) })
  }
  return syllables
}

/** Weak vowels next to another vowel of the same syllable become glides j / w (bueno → ˈbweno). */
function syllableIpa(syllable: Syllable): string {
  const vowels = syllable.segments.filter((s) => s.vowel)
  const candidates = vowels.filter((s) => !s.glide)
  const nucleus =
    vowels.find((s) => s.strong) ??
    (candidates.length > 1 ? candidates[candidates.length - 1] : (candidates[0] ?? vowels[0]))
  return syllable.segments
    .map((s) => {
      if (!s.vowel || s === nucleus) return s.ipa
      return s.ipa === 'i' ? 'j' : s.ipa === 'u' ? 'w' : s.ipa
    })
    .join('')
}

function transcribeWord(word: string, rules: VariantRules): string {
  const syllables = syllabify(segment(word, rules))
  let stressed = syllables.findIndex((s) => s.accented)
  if (stressed === -1) {
    // No accent mark: ending in a vowel, n or s — the penultimate syllable, otherwise the last.
    const last = word[word.length - 1] ?? ''
    stressed = /[aeiouns]/.test(last) ? Math.max(0, syllables.length - 2) : syllables.length - 1
  }
  return syllables.map((s, i) => (syllables.length > 1 && i === stressed ? 'ˈ' : '') + syllableIpa(s)).join('')
}

/** Transcription of a Spanish word or phrase; by default the space's Argentine variant. */
export function transcribeSpanish(phrase: string, variant: SpanishVariant = 'es-AR'): string | null {
  const words = phrase
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  if (words.length === 0) return null
  return words.map((word) => transcribeWord(word, VARIANTS[variant])).join(' ')
}
