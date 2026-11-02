import type { CardCreateInput, SpaceId } from '../../shared/types'
import { parseCsvRecords } from './csv'

export interface DuoCardsRecord {
  input: CardCreateInput
  /** When the card was created in DuoCards — to keep the original order. */
  publishedAt: string | null
}

/** Example numbering like "1) …", "2) …" in the hint field. */
const NUMBERING = /^\s*\d+[).]\s*/

/** A dialog line: "- ¿Cómo estás?". */
const DIALOGUE_LINE = /^[-–—]\s*/

/** Hint lines → examples. Consecutive dialog lines stay one example. */
export function splitExamples(hint: string): string[] {
  const examples: string[] = []
  let previousWasDialogue = false
  for (const raw of hint.split(/\r?\n/)) {
    const line = raw.replace(NUMBERING, '').trim()
    if (!line) continue
    const isDialogue = DIALOGUE_LINE.test(line)
    if (isDialogue && previousWasDialogue && examples.length > 0) {
      examples[examples.length - 1] += `\n${line}`
    } else {
      examples.push(line)
    }
    previousWasDialogue = isDialogue
  }
  return examples
}

/**
 * A DuoCards export (columns front, back, hint, publishedAt) → data for CardService.create.
 * front — the studied expression, back — the meaning, hint — one or more examples.
 */
export function parseDuoCardsExport(csv: string, spaceId: SpaceId): DuoCardsRecord[] {
  return parseCsvRecords(csv)
    .map((record) => ({
      input: {
        spaceId,
        term: (record['front'] ?? '').trim(),
        meaning: (record['back'] ?? '').trim(),
        examples: splitExamples(record['hint'] ?? '').map((text) => ({ text }))
      },
      publishedAt: record['publishedAt']?.trim() || null
    }))
    .filter((r) => r.input.term !== '' && r.input.meaning !== '')
}
