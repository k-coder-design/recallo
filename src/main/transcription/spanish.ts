/**
 * Транскрипция испанского по правилам чтения, два варианта (D22, D44):
 * - es-AR, ríoplatense: ll и y перед гласной → [ʃ], c(e/i) и z → [s];
 * - es-ES, кастильский: ll и y перед гласной → [ʝ], c(e/i) и z → [θ].
 * Широкая (фонологическая) запись без аллофонов β ð ɣ.
 */

export type SpanishVariant = 'es-AR' | 'es-ES'

interface VariantRules {
  /** ll и y перед гласной. */
  palatal: string
  /** c перед e/i и z. */
  sibilant: string
}

const VARIANTS: Record<SpanishVariant, VariantRules> = {
  'es-AR': { palatal: 'ʃ', sibilant: 's' },
  'es-ES': { palatal: 'ʝ', sibilant: 'θ' }
}

interface Segment {
  ipa: string
  vowel: boolean
  /** Сильная гласная (a, e, o или с ударением): образует отдельный слог. */
  strong: boolean
  accented: boolean
  /** Конечная y (muy, hoy): всегда глайд, слоговой не бывает. */
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
/** Неразделимые сочетания: согласный + l/ɾ уходят в один слог (pla-to, ha-blar). */
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
      // excelente: xc перед e/i читается [ks], а не [kss].
      if (next === 'c' && FRONT.has(afterNext)) i++
    } else if (c === 'y') {
      // Перед гласной y — согласный (как ll); после гласной (muy, hoy) — глайд; отдельно (y) — гласная i.
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

/** Делит слово на слоги: дифтонги (слабая i/u рядом с гласной) остаются в одном слоге. */
function syllabify(segments: Segment[]): Syllable[] {
  // Ядра: подряд идущие гласные, разделённые между двумя сильными.
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

/** Слабые гласные рядом с другой гласной того же слога — глайды j / w (bueno → ˈbweno). */
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
    // Без знака ударения: на гласную, n или s — предпоследний слог, иначе последний.
    const last = word[word.length - 1] ?? ''
    stressed = /[aeiouns]/.test(last) ? Math.max(0, syllables.length - 2) : syllables.length - 1
  }
  return syllables.map((s, i) => (syllables.length > 1 && i === stressed ? 'ˈ' : '') + syllableIpa(s)).join('')
}

/** Транскрипция испанского слова или фразы; по умолчанию — аргентинский вариант пространства. */
export function transcribeSpanish(phrase: string, variant: SpanishVariant = 'es-AR'): string | null {
  const words = phrase
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  if (words.length === 0) return null
  return words.map((word) => transcribeWord(word, VARIANTS[variant])).join(' ')
}
