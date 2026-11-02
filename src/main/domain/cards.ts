import { randomUUID } from 'node:crypto'
import type { Db } from '../db/database'
import type { Card, CardQuery, DuplicateCard, EmojiSuggestions, Example, Pronunciation, Space, SpaceId, TranscriptionSuggestion } from '../../shared/types'
import { ALT_ACCENTS, PRIMARY_ACCENTS } from '../../shared/accents'
import { DomainError } from './errors'
import { parseProgress, serializeProgress, toCardProgress, type Clock, type FsrsCard, type Scheduler } from './scheduler'
import { cardCreateSchema, cardQuerySchema, cardUpdateSchema, spaceIdSchema } from './validation'
import { isSameTerm } from './duplicates'
import { searchCards } from './cardSearch'
import { scopeCondition, type SetService } from './sets'
import { normalizeTranscription, transcribe, transcribeAlt } from '../transcription'
import { suggestEmoji, suggestEmojis } from '../emoji'

interface CardRow {
  id: string
  space_id: SpaceId
  set_id: string | null
  term: string
  meaning: string
  transcription: string | null
  transcription_alt: string | null
  emoji: string | null
  emoji_auto: number
  version: number
  created_at: string
  updated_at: string
}

interface ExampleRow {
  card_id: string
  text: string
  translation: string | null
  mask_fragments: string
}

interface ProgressRow {
  card_id: string
  fsrs: string
  introduced_at: string | null
}

export class CardService {
  constructor(
    private readonly db: Db,
    private readonly scheduler: Scheduler,
    private readonly sets: SetService,
    private readonly now: Clock
  ) {}

  listSpaces(): Space[] {
    return this.db.prepare('SELECT id, name, tts_lang AS ttsLang FROM spaces ORDER BY position').all() as Space[]
  }

  getSpace(spaceId: SpaceId): Space {
    const space = this.listSpaces().find((s) => s.id === spaceId)
    if (!space) throw new DomainError('NOT_FOUND', 'Language space not found', { spaceId })
    return space
  }

  /** Cards of a language: the whole scope, a set or "no set", with search by word, meaning and set (API-02). */
  list(spaceId: SpaceId, query?: CardQuery): Card[] {
    const id = spaceIdSchema.parse(spaceId)
    const { scope, search } = cardQuerySchema.parse(query)
    const condition = scopeCondition(scope)
    const rows = this.db
      .prepare(
        `SELECT c.*, s.name AS set_name FROM cards c LEFT JOIN sets s ON s.id = c.set_id
         WHERE c.space_id = @spaceId AND ${condition.sql}
         ORDER BY c.created_at DESC, c.rowid DESC`
      )
      .all({ spaceId: id, ...condition.params }) as Array<CardRow & { set_name: string | null }>

    // Search in JS, not via LIKE: SQLite cannot ignore case for Cyrillic and diacritics,
    // and we also need examples, typos and ordering by match quality (D54).
    const cards = this.hydrate(rows)
    if (!search) return cards
    const setNames = new Map(rows.flatMap((r) => (r.set_id && r.set_name ? [[r.set_id, r.set_name] as const] : [])))
    return searchCards(cards, setNames, search)
  }

  /** Cards of the same language with the same word — for the duplicate warning. */
  findDuplicates(spaceId: SpaceId, term: string, excludeId?: string): DuplicateCard[] {
    const id = spaceIdSchema.parse(spaceId)
    const rows = this.db
      .prepare(
        `SELECT c.id, c.term, c.meaning, s.name AS setName FROM cards c LEFT JOIN sets s ON s.id = c.set_id
         WHERE c.space_id = ? AND c.id != ?`
      )
      .all(id, excludeId ?? '') as DuplicateCard[]
    return rows.filter((row) => isSameTerm(row.term, term))
  }

  /** Move cards into a set or "no set"; progress and schedule do not change (SET-04, SET-07). */
  moveToSet(cardIds: string[], setId: string | null): Card[] {
    const now = this.now().toISOString()
    this.db.transaction(() => {
      for (const cardId of cardIds) {
        const card = this.get(cardId)
        if (setId) this.sets.requireInSpace(setId, card.spaceId)
        this.db
          .prepare('UPDATE cards SET set_id = ?, version = version + 1, updated_at = ? WHERE id = ?')
          .run(setId, now, cardId)
      }
    })()
    return cardIds.map((cardId) => this.get(cardId))
  }

  get(id: string): Card {
    const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow | undefined
    if (!row) throw new DomainError('NOT_FOUND', 'Card not found', { id })
    return this.hydrate([row])[0] as Card
  }

  create(input: unknown): Card {
    const data = cardCreateSchema.parse(input)
    const id = randomUUID()
    const now = this.now()
    const timestamp = now.toISOString()

    if (data.setId) this.sets.requireInSpace(data.setId, data.spaceId)
    const transcription = normalizeTranscription(data.transcription) ?? transcribe(data.term, data.spaceId)
    const transcriptionAlt = ALT_ACCENTS[data.spaceId] ? (normalizeTranscription(data.transcriptionAlt) ?? transcribeAlt(data.term, data.spaceId)) : null
    const emoji =
      data.emoji !== undefined
        ? { value: data.emoji || '', auto: 0 }
        : { value: suggestEmoji(data.term, data.meaning, data.spaceId), auto: 1 }

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO cards (id, space_id, set_id, term, meaning, transcription, transcription_alt, emoji, emoji_auto, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          id,
          data.spaceId,
          data.setId ?? null,
          data.term,
          data.meaning,
          transcription,
          transcriptionAlt,
          emoji.value,
          emoji.auto,
          timestamp,
          timestamp
        )
      this.writeExamples(id, data.examples)
      this.writeProgress(id, this.scheduler.initial(now))
    })()

    return this.get(id)
  }

  /** Changing content does not touch progress unless a reset is explicitly requested (CARD-04, CARD-05). */
  update(id: string, input: unknown): Card {
    const data = cardUpdateSchema.parse(input)
    const now = this.now()

    this.db.transaction(() => {
      const current = this.get(id)
      if (current.version !== data.version) {
        throw new DomainError('CONFLICT', 'This card has been changed elsewhere. Reopen it and try again.', {
          currentVersion: current.version
        })
      }
      const term = data.term ?? current.term
      // A passed transcription is kept as is (an empty one is rebuilt);
      // one not passed is kept until the word itself changes.
      let transcription = current.transcription
      if (data.transcription !== undefined) {
        transcription = normalizeTranscription(data.transcription) ?? transcribe(term, current.spaceId)
      } else if (term !== current.term) {
        transcription = transcribe(term, current.spaceId)
      }
      let transcriptionAlt = current.transcriptionAlt
      if (!ALT_ACCENTS[current.spaceId]) transcriptionAlt = null
      else if (data.transcriptionAlt !== undefined) {
        transcriptionAlt = normalizeTranscription(data.transcriptionAlt) ?? transcribeAlt(term, current.spaceId)
      } else if (term !== current.term) {
        transcriptionAlt = transcribeAlt(term, current.spaceId)
      }
      const meaning = data.meaning ?? current.meaning
      // The set changes only if passed; progress is kept on a move (SET-07).
      let setId = current.setId
      if (data.setId !== undefined) {
        if (data.setId) this.sets.requireInSpace(data.setId, current.spaceId)
        setId = data.setId ?? null
      }
      // The user's choice is kept; an automatic emoji is picked again when the word or meaning changes.
      let emoji: string | null = current.emoji ?? (current.emojiAuto ? null : '')
      let emojiAuto = current.emojiAuto
      if (data.emoji !== undefined) {
        emoji = data.emoji || ''
        emojiAuto = false
      } else if (current.emojiAuto && (term !== current.term || meaning !== current.meaning)) {
        emoji = suggestEmoji(term, meaning, current.spaceId)
      }
      this.db
        .prepare(
          `UPDATE cards SET set_id = ?, term = ?, meaning = ?, transcription = ?, transcription_alt = ?, emoji = ?, emoji_auto = ?,
             version = version + 1, updated_at = ? WHERE id = ?`
        )
        .run(setId, term, meaning, transcription, transcriptionAlt, emoji, emojiAuto ? 1 : 0, now.toISOString(), id)
      if (data.examples) {
        this.db.prepare('DELETE FROM examples WHERE card_id = ?').run(id)
        this.writeExamples(id, data.examples)
      }
      if (data.resetProgress) {
        this.writeProgress(id, this.scheduler.initial(now))
        this.db.prepare('UPDATE card_progress SET introduced_at = NULL, intro_due = NULL WHERE card_id = ?').run(id)
      }
    })()

    return this.get(id)
  }

  /** Hint for the editor: which transcriptions the app will build for this word. */
  suggestTranscription(spaceId: SpaceId, term: string): TranscriptionSuggestion {
    const space = spaceIdSchema.parse(spaceId)
    return { transcription: transcribe(term, space), transcriptionAlt: transcribeAlt(term, space) }
  }

  /** A card's pronunciations for Study: the primary first, then the second one if the language has it (D44). */
  pronunciations(card: Card): Pronunciation[] {
    const primary = PRIMARY_ACCENTS[card.spaceId]
    const alt = ALT_ACCENTS[card.spaceId]
    const list: Pronunciation[] = [{ ...primary, lang: this.getSpace(card.spaceId).ttsLang, transcription: card.transcription }]
    if (alt) list.push({ ...alt, transcription: card.transcriptionAlt })
    return list
  }

  /**
   * Fills in the transcription of cards that do not have one yet (created before D22 or with words
   * that were not in the dictionary). Does not change version: this is not a user edit of the content.
   */
  fillMissingTranscriptions(): number {
    const rows = this.db.prepare('SELECT id, space_id, term FROM cards WHERE transcription IS NULL').all() as Array<
      Pick<CardRow, 'id' | 'space_id' | 'term'>
    >
    const update = this.db.prepare('UPDATE cards SET transcription = ? WHERE id = ?')
    let filled = 0
    this.db.transaction(() => {
      for (const row of rows) {
        const transcription = transcribe(row.term, row.space_id)
        if (transcription) {
          update.run(transcription, row.id)
          filled++
        }
      }
    })()
    const altRows = this.db
      .prepare(`SELECT id, space_id, term FROM cards WHERE transcription_alt IS NULL AND space_id IN (${altSpaces()})`)
      .all() as Array<Pick<CardRow, 'id' | 'space_id' | 'term'>>
    const updateAlt = this.db.prepare('UPDATE cards SET transcription_alt = ? WHERE id = ?')
    this.db.transaction(() => {
      for (const row of altRows) {
        const transcriptionAlt = transcribeAlt(row.term, row.space_id)
        if (transcriptionAlt) {
          updateAlt.run(transcriptionAlt, row.id)
          filled++
        }
      }
    })()
    return filled
  }

  /** Emoji for the editor: what the automatic pick chooses and options for a manual choice. */
  suggestEmojis(spaceId: SpaceId, term: string, meaning: string): EmojiSuggestions {
    const space = spaceIdSchema.parse(spaceId)
    return { best: suggestEmoji(term, meaning, space), options: suggestEmojis(term, meaning, space) }
  }

  /** Fills in an automatic emoji where none was picked yet (D27); the user's choice is not touched. */
  fillMissingEmojis(): number {
    const rows = this.db
      .prepare('SELECT id, space_id, term, meaning FROM cards WHERE emoji IS NULL AND emoji_auto = 1')
      .all() as Array<Pick<CardRow, 'id' | 'space_id' | 'term' | 'meaning'>>
    const update = this.db.prepare('UPDATE cards SET emoji = ? WHERE id = ?')
    let filled = 0
    this.db.transaction(() => {
      for (const row of rows) {
        const emoji = suggestEmoji(row.term, row.meaning, row.space_id)
        if (emoji) {
          update.run(emoji, row.id)
          filled++
        }
      }
    })()
    return filled
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM cards WHERE id = ?').run(id)
    if (result.changes === 0) throw new DomainError('NOT_FOUND', 'Card not found', { id })
  }

  readProgress(cardId: string): FsrsCard {
    const row = this.db.prepare('SELECT fsrs FROM card_progress WHERE card_id = ?').get(cardId) as
      | { fsrs: string }
      | undefined
    if (!row) throw new DomainError('NOT_FOUND', 'Card not found', { id: cardId })
    return parseProgress(row.fsrs)
  }

  writeProgress(cardId: string, card: FsrsCard): void {
    this.db
      .prepare(
        `INSERT INTO card_progress (card_id, state, due, fsrs) VALUES (?, ?, ?, ?)
         ON CONFLICT (card_id) DO UPDATE SET state = excluded.state, due = excluded.due, fsrs = excluded.fsrs`
      )
      .run(cardId, card.state, card.due.toISOString(), serializeProgress(card))
  }

  private writeExamples(cardId: string, examples: Example[]): void {
    const insert = this.db.prepare(
      'INSERT INTO examples (card_id, position, text, translation, mask_fragments) VALUES (?, ?, ?, ?, ?)'
    )
    examples.forEach((example, position) => {
      insert.run(cardId, position, example.text, example.translation, JSON.stringify(example.maskFragments))
    })
  }

  private hydrate(rows: CardRow[]): Card[] {
    if (rows.length === 0) return []
    const ids = JSON.stringify(rows.map((r) => r.id))

    const examples = new Map<string, Example[]>()
    const exampleRows = this.db
      .prepare(
        `SELECT card_id, text, translation, mask_fragments FROM examples
         WHERE card_id IN (SELECT value FROM json_each(?)) ORDER BY card_id, position`
      )
      .all(ids) as ExampleRow[]
    for (const row of exampleRows) {
      const list = examples.get(row.card_id) ?? []
      list.push({
        text: row.text,
        translation: row.translation,
        maskFragments: JSON.parse(row.mask_fragments) as string[]
      })
      examples.set(row.card_id, list)
    }

    const progress = new Map<string, ProgressRow>()
    const progressRows = this.db
      .prepare(
        'SELECT card_id, fsrs, introduced_at FROM card_progress WHERE card_id IN (SELECT value FROM json_each(?))'
      )
      .all(ids) as ProgressRow[]
    for (const row of progressRows) progress.set(row.card_id, row)

    return rows.map((row) => {
      const stored = progress.get(row.id)
      const fsrsCard = stored ? parseProgress(stored.fsrs) : this.scheduler.initial(new Date(row.created_at))
      return {
        id: row.id,
        spaceId: row.space_id,
        setId: row.set_id,
        term: row.term,
        meaning: row.meaning,
        transcription: row.transcription,
        transcriptionAlt: row.transcription_alt,
        emoji: row.emoji || null,
        emojiAuto: row.emoji_auto === 1,
        examples: examples.get(row.id) ?? [],
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        progress: toCardProgress(fsrsCard, stored?.introduced_at ?? null)
      }
    })
  }
}

/** Spaces with a second pronunciation — for the SQL condition IN (...). */
function altSpaces(): string {
  return (Object.keys(ALT_ACCENTS) as SpaceId[])
    .filter((id) => ALT_ACCENTS[id])
    .map((id) => `'${id}'`)
    .join(', ')
}
