import type { CardCreateInput, SpaceId } from '../../shared/types'
import { parseCsvRecords } from './csv'

export interface DuoCardsRecord {
  input: CardCreateInput
  /** Время создания карточки в DuoCards — чтобы сохранить исходный порядок. */
  publishedAt: string | null
}

/** Нумерация примеров вида «1) …», «2) …» в поле hint. */
const NUMBERING = /^\s*\d+[).]\s*/

/** Реплика диалога: «- ¿Cómo estás?». */
const DIALOGUE_LINE = /^[-–—]\s*/

/** Строки подсказки → примеры. Подряд идущие реплики диалога остаются одним примером. */
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
 * Экспорт DuoCards (колонки front, back, hint, publishedAt) → данные для CardService.create.
 * front — изучаемое выражение, back — значение, hint — один или несколько примеров.
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
