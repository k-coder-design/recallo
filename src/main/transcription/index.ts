import type { SpaceId } from '../../shared/types'
import { transcribeEnglish } from './english'
import { transcribeSpanish } from './spanish'
import { ALT_ACCENTS } from '../../shared/accents'

/**
 * Автоматическая транскрипция (IPA, без косых черт), без сети: английский — словарь CMU,
 * испанский — правила чтения. Варианты через « / » транскрибируются по отдельности.
 * null — если транскрипцию построить не удалось (её можно ввести вручную).
 */
export function transcribe(term: string, spaceId: SpaceId): string | null {
  return eachVariant(term, (variant) => (spaceId === 'en' ? transcribeEnglish(variant) : transcribeSpanish(variant, 'es-AR')))
}

/** Второй вариант произношения (D44): для испанского — кастильский (Испания); у английского его нет. */
export function transcribeAlt(term: string, spaceId: SpaceId): string | null {
  if (!ALT_ACCENTS[spaceId]) return null
  return eachVariant(term, (variant) => transcribeSpanish(variant, 'es-ES'))
}

function eachVariant(term: string, fn: (variant: string) => string | null): string | null {
  const variants = term.split(/\s+\/\s+/).map(fn)
  if (variants.length === 0 || variants.some((v) => v === null)) return null
  return variants.join(' / ')
}

/** Ручной ввод: убираем обрамляющие /…/ или […], пустое значение — «заполнить автоматически». */
export function normalizeTranscription(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().replace(/^[/[]\s*|\s*[/\]]$/g, '').trim()
  return trimmed || null
}
