import type { Card, CardSet, ExampleInput, ImportFormat, SpaceId } from '../../shared/types'
import { DomainError } from '../domain/errors'
import { parseCsv, parseCsvRecords } from './csv'
import { splitExamples } from './duocards'

/** Карточка из файла — до проверки и создания. */
export interface ParsedCard {
  term: string
  meaning: string
  transcription?: string | null
  transcriptionAlt?: string | null
  emoji?: string | null
  /** Название набора из файла (форматы Recallo); null — без набора. */
  set: string | null
  examples: ExampleInput[]
}

/** Сколько примеров пишем в CSV: остальные есть только в JSON. */
const CSV_EXAMPLES = 3

/** Формат по содержимому: JSON, заголовок DuoCards или Recallo, иначе — строки «термин⇥определение» Quizlet. */
export function detectFormat(content: string): ImportFormat {
  const text = content.replace(/^﻿/, '').trimStart()
  if (text.startsWith('{') || text.startsWith('[')) return 'recallo-json'
  const header = (parseCsv(text.split(/\r?\n/, 1)[0] ?? '')[0] ?? []).map((h) => h.trim().toLowerCase())
  if (header.includes('front') && header.includes('back')) return 'duocards'
  if (header.includes('term') && header.includes('meaning')) return 'recallo-csv'
  return 'quizlet'
}

function fail(message: string): never {
  throw new DomainError('VALIDATION', message)
}

function parseRecalloJson(text: string): ParsedCard[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    fail('The file is not valid JSON')
  }
  // Поддерживаем словарь Recallo, файл набора (data/sets/*.json) и просто массив карточек.
  const root = data as { format?: string; name?: string; cards?: unknown }
  if (root?.format === 'recallo-backup') fail('This is a full backup. Restore it in Settings → Backup instead.')
  const cards = Array.isArray(data) ? data : Array.isArray(root?.cards) ? root.cards : fail('No "cards" list found in the JSON file')
  const fileSet = !Array.isArray(data) && typeof root.name === 'string' ? root.name : null
  return (cards as Array<Record<string, unknown>>).map((c) => ({
    term: String(c['term'] ?? ''),
    meaning: String(c['meaning'] ?? ''),
    transcription: typeof c['transcription'] === 'string' ? c['transcription'] : undefined,
    transcriptionAlt: typeof c['transcriptionAlt'] === 'string' ? c['transcriptionAlt'] : undefined,
    emoji: typeof c['emoji'] === 'string' ? c['emoji'] : undefined,
    set: typeof c['set'] === 'string' && c['set'] ? c['set'] : fileSet,
    examples: Array.isArray(c['examples'])
      ? (c['examples'] as Array<Record<string, unknown>>).map((e) => ({
          text: String(e['text'] ?? ''),
          translation: typeof e['translation'] === 'string' ? e['translation'] : null,
          maskFragments: Array.isArray(e['maskFragments']) ? (e['maskFragments'] as unknown[]).map(String) : []
        }))
      : []
  }))
}

function parseRecalloCsv(text: string): ParsedCard[] {
  return parseCsvRecords(text).map((r) => {
    const examples: ExampleInput[] = []
    for (let i = 1; r[`example_${i}`] !== undefined; i++) {
      const exampleText = (r[`example_${i}`] ?? '').trim()
      if (!exampleText) continue
      examples.push({
        text: exampleText,
        translation: (r[`translation_${i}`] ?? '').trim() || null,
        maskFragments: (r[`hide_${i}`] ?? '').split(';').map((f) => f.trim()).filter(Boolean)
      })
    }
    return {
      term: r['term'] ?? '',
      meaning: r['meaning'] ?? '',
      transcription: (r['transcription'] ?? '').trim() || undefined,
      transcriptionAlt: (r['transcription_alt'] ?? '').trim() || undefined,
      emoji: (r['emoji'] ?? '').trim() || undefined,
      set: (r['set'] ?? '').trim() || null,
      examples
    }
  })
}

function parseDuoCards(text: string): ParsedCard[] {
  return parseCsvRecords(text).map((r) => ({
    term: r['front'] ?? '',
    meaning: r['back'] ?? '',
    set: null,
    examples: splitExamples(r['hint'] ?? '').map((exampleText) => ({ text: exampleText }))
  }))
}

/** Quizlet: «термин⇥определение» по строкам (по умолчанию), либо CSV из двух колонок. */
function parseQuizlet(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const pairs = lines.some((l) => l.includes('\t'))
    ? lines.map((l) => {
        const at = l.indexOf('\t')
        return at < 0 ? [l, ''] : [l.slice(0, at), l.slice(at + 1)]
      })
    : parseCsv(text).map((row) => [row[0] ?? '', row.slice(1).join(', ')])
  return pairs.map(([term, meaning]) => ({ term: term ?? '', meaning: meaning ?? '', set: null, examples: [] }))
}

/** Разбирает файл в карточки; swap меняет местами слово и значение. */
export function parseImport(content: string, format: ImportFormat, swap = false): ParsedCard[] {
  const text = content.replace(/^﻿/, '')
  const parsers: Record<ImportFormat, (t: string) => ParsedCard[]> = {
    'recallo-json': parseRecalloJson,
    'recallo-csv': parseRecalloCsv,
    duocards: parseDuoCards,
    quizlet: parseQuizlet
  }
  // Совсем пустые строки (без слова и без значения) не считаем карточками.
  const cards = parsers[format](text)
    .map((c) => ({ ...c, term: c.term.trim(), meaning: c.meaning.trim() }))
    .filter((c) => c.term || c.meaning)
  return swap ? cards.map((c) => ({ ...c, term: c.meaning, meaning: c.term })) : cards
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Словарь в CSV Recallo: одна строка — одна карточка, до трёх примеров. Открывается в Excel/Numbers. */
export function toRecalloCsv(cards: Card[], sets: CardSet[]): string {
  const setName = (id: string | null) => sets.find((s) => s.id === id)?.name ?? ''
  const columns = ['term', 'meaning', 'set', 'transcription', 'transcription_alt', 'emoji']
  for (let i = 1; i <= CSV_EXAMPLES; i++) columns.push(`example_${i}`, `translation_${i}`, `hide_${i}`)
  const rows = cards.map((card) => {
    const values = [card.term, card.meaning, setName(card.setId), card.transcription ?? '', card.transcriptionAlt ?? '', card.emoji ?? '']
    for (let i = 0; i < CSV_EXAMPLES; i++) {
      const example = card.examples[i]
      values.push(example?.text ?? '', example?.translation ?? '', example?.maskFragments.join('; ') ?? '')
    }
    return values.map(csvField).join(',')
  })
  // BOM — чтобы Excel сразу открывал файл в UTF-8 (кириллица, эмодзи, IPA).
  return `﻿${[columns.join(','), ...rows].join('\r\n')}\r\n`
}

/** Словарь в JSON Recallo: все примеры и наборы, читается импортом обратно без потерь. */
export function toRecalloJson(spaceId: SpaceId, cards: Card[], sets: CardSet[], exportedAt: string): string {
  const setName = (id: string | null) => sets.find((s) => s.id === id)?.name ?? null
  const usedSets = sets.filter((s) => cards.some((c) => c.setId === s.id))
  return `${JSON.stringify(
    {
      format: 'recallo-dictionary',
      version: 1,
      language: spaceId,
      exportedAt,
      sets: usedSets.map((s) => ({ name: s.name, description: s.description })),
      cards: cards.map((c) => ({
        term: c.term,
        meaning: c.meaning,
        set: setName(c.setId),
        transcription: c.transcription,
        ...(c.transcriptionAlt ? { transcriptionAlt: c.transcriptionAlt } : {}),
        emoji: c.emoji,
        examples: c.examples.map((e) => ({ text: e.text, translation: e.translation, maskFragments: e.maskFragments }))
      }))
    },
    null,
    2
  )}\n`
}
