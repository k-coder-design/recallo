import type { SpaceId } from '../../shared/types'
import { transcribeEnglish } from './english'
import { transcribeSpanish } from './spanish'
import { ALT_ACCENTS } from '../../shared/accents'

/**
 * Automatic transcription (IPA, without slashes), offline: English — the CMU dictionary,
 * Spanish — reading rules. Variants split by " / " are transcribed separately.
 * null — if a transcription could not be built (it can be entered manually).
 */
export function transcribe(term: string, spaceId: SpaceId): string | null {
  return eachVariant(term, (variant) => (spaceId === 'en' ? transcribeEnglish(variant) : transcribeSpanish(variant, 'es-AR')))
}

/** Second pronunciation (D44): for Spanish — Castilian (Spain); English has none. */
export function transcribeAlt(term: string, spaceId: SpaceId): string | null {
  if (!ALT_ACCENTS[spaceId]) return null
  return eachVariant(term, (variant) => transcribeSpanish(variant, 'es-ES'))
}

function eachVariant(term: string, fn: (variant: string) => string | null): string | null {
  const variants = term.split(/\s+\/\s+/).map(fn)
  if (variants.length === 0 || variants.some((v) => v === null)) return null
  return variants.join(' / ')
}

/** Manual input: strip surrounding /…/ or […]; an empty value means "fill in automatically". */
export function normalizeTranscription(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().replace(/^[/[]\s*|\s*[/\]]$/g, '').trim()
  return trimmed || null
}
