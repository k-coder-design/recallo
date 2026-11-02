import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { RecalloApiError, RecalloUnavailableError, type RecalloClient } from './client'

interface ApiSet {
  id: string
  name: string
  description: string | null
  cardCount: number
  version: number
}

interface ApiCard {
  id: string
  setId: string | null
  term: string
  transcription: string | null
  transcriptionAlt: string | null
  meaning: string
  emoji: string | null
  examples: Array<{ text: string; translation: string | null }>
  version: number
}

/** Language: accept both a code and a name — easier for an agent. */
const language = z
  .preprocess((value) => {
    const v = String(value ?? '').trim().toLowerCase()
    return v === 'english' ? 'en' : v === 'spanish' || v === 'español' || v === 'espanol' ? 'es' : v
  }, z.enum(['en', 'es']))
  .describe('Language space: "en" (English) or "es" (Spanish)')

const exampleInput = z.object({
  text: z.string().describe('A natural sentence that uses the word or phrase'),
  translation: z.string().optional().describe('Translation of the sentence, in the same language as the card meaning (Russian meaning → Russian translation, English meaning → English)'),
  maskFragments: z.array(z.string()).optional().describe('Irregular forms used in the sentence to hide on the card front, e.g. ["went"] for "go"')
})

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })

/** API errors and Recallo being unavailable become a tool answer the agent understands. */
async function run(action: () => Promise<unknown>) {
  try {
    return text(await action())
  } catch (error) {
    if (error instanceof RecalloUnavailableError) return { ...text(error.message), isError: true }
    if (error instanceof RecalloApiError) {
      return { ...text({ error: { code: error.code, message: error.message, details: error.details } }), isError: true }
    }
    throw error
  }
}

const brief = (card: ApiCard, sets: ApiSet[]) => ({
  id: card.id,
  term: card.term,
  meaning: card.meaning,
  emoji: card.emoji,
  transcription: card.transcription,
  ...(card.transcriptionAlt ? { transcriptionAlt: card.transcriptionAlt } : {}),
  set: sets.find((s) => s.id === card.setId)?.name ?? null,
  version: card.version
})

export function createRecalloServer(client: RecalloClient, version: string): McpServer {
  const server = new McpServer({ name: 'recallo', version })

  const listSets = (lang: string) => client.request<ApiSet[]>('GET', `/sets?language=${lang}`)

  /** A set by id, name or "none" (no set). */
  async function resolveSet(lang: string, ref: string | null | undefined): Promise<string | null | undefined> {
    if (ref === undefined) return undefined
    if (ref === null || ref.trim().toLowerCase() === 'none' || ref.trim() === '') return null
    const sets = await listSets(lang)
    const found = sets.find((s) => s.id === ref || s.name.toLowerCase() === ref.trim().toLowerCase())
    if (!found) {
      throw new RecalloApiError(404, 'SET_NOT_FOUND', `There is no set “${ref}”. Existing sets: ${sets.map((s) => s.name).join(', ') || 'none'}. Use create_set to make a new one.`)
    }
    return found.id
  }

  server.registerTool(
    'list_sets',
    {
      title: 'List sets',
      description: 'List word sets of a language in Recallo with the number of cards in each.',
      inputSchema: { language },
      annotations: { readOnlyHint: true }
    },
    ({ language: lang }) =>
      run(async () => (await listSets(lang)).map((s) => ({ id: s.id, name: s.name, description: s.description, cards: s.cardCount, version: s.version })))
  )

  server.registerTool(
    'search_cards',
    {
      title: 'Search cards',
      description:
        'Find cards by word, meaning or set name (case- and accent-insensitive). Without a query returns the cards of the language or set. ' +
        'Use it to check whether a word is already in Recallo before adding it, and to get the id and version needed for editing.',
      inputSchema: {
        language,
        query: z.string().optional().describe('Text to search for: parts of words work, every word must match; best matches first'),
        set: z.string().optional().describe('Set name or id, or "none" for cards without a set'),
        limit: z.number().int().min(1).max(200).optional().describe('Maximum number of cards, default 50')
      },
      annotations: { readOnlyHint: true }
    },
    ({ language: lang, query, set, limit }) =>
      run(async () => {
        const setId = await resolveSet(lang, set)
        const params = new URLSearchParams({ language: lang, limit: String(limit ?? 50) })
        if (query) params.set('search', query)
        if (setId !== undefined) params.set('set', setId ?? 'none')
        const [result, sets] = await Promise.all([
          client.request<{ total: number; cards: ApiCard[] }>('GET', `/cards?${params}`),
          listSets(lang)
        ])
        return { total: result.total, cards: result.cards.map((c) => brief(c, sets)) }
      })
  )

  server.registerTool(
    'get_card',
    {
      title: 'Get card',
      description: 'Get one card with all its examples.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true }
    },
    ({ id }) => run(() => client.request('GET', `/cards/${encodeURIComponent(id)}`))
  )

  server.registerTool(
    'add_cards',
    {
      title: 'Add cards',
      description:
        'Add one or more words or phrases to Recallo (up to 200 at a time). Words that already exist are skipped and reported as duplicates. ' +
        // The example shows the user's meaning style: a Russian translation, then an English definition.
        'Write the meaning as the user likes it, e.g. "захватывающий (so exciting you can’t stop watching)". ' +
        'Give each card one emoji that evokes its meaning (e.g. 🍿 for "gripping" about films) — Recallo’s own pick is only a rough keyword match. ' +
        'Add 1–3 natural example sentences; translate each into the same language as the meaning. ' +
        'Transcription and hiding the word in examples are filled in by Recallo automatically.',
      inputSchema: {
        language,
        set: z.string().optional().describe('Set name or id to put the cards in; omit for no set'),
        cards: z
          .array(
            z.object({
              term: z.string().describe('The word or phrase to learn'),
              meaning: z.string().describe('Translation or definition'),
              examples: z.array(exampleInput).optional(),
              emoji: z.string().optional().describe('One emoji that evokes the meaning'),
              transcription: z.string().optional().describe('Optional IPA without slashes (Spanish: Argentine)'),
              transcriptionAlt: z.string().optional().describe('Spanish only, optional: IPA for Spain pronunciation')
            })
          )
          .min(1)
          .max(200),
        allow_duplicates: z.boolean().optional().describe('Add words even if they already exist (default false)')
      }
    },
    ({ language: lang, set, cards, allow_duplicates }) =>
      run(async () => {
        const setId = await resolveSet(lang, set)
        const result = await client.request<{
          summary: { created: number; duplicates: number; errors: number }
          results: Array<{ index: number; status: string; card?: ApiCard; term?: string; existing?: unknown; error?: unknown }>
        }>('POST', '/cards/batch', { language: lang, setId: setId ?? null, allowDuplicates: allow_duplicates ?? false, cards })
        return {
          summary: result.summary,
          results: result.results.map((r) =>
            r.status === 'created' && r.card
              ? { status: 'created', term: r.card.term, id: r.card.id, transcription: r.card.transcription, emoji: r.card.emoji }
              : { status: r.status, term: r.term, ...(r.existing ? { existing: r.existing } : {}), ...(r.error ? { error: r.error } : {}) }
          )
        }
      })
  )

  server.registerTool(
    'update_card',
    {
      title: 'Update card',
      description:
        'Edit a card. Pass the version you got from search_cards or get_card; if the card changed since then you get a CONFLICT — read it again. ' +
        'Learning progress is kept. Passing examples replaces all examples of the card.',
      inputSchema: {
        id: z.string(),
        version: z.number().int(),
        term: z.string().optional(),
        meaning: z.string().optional(),
        examples: z.array(exampleInput).optional(),
        emoji: z.string().nullable().optional().describe('New emoji, or null for none'),
        transcription: z.string().nullable().optional().describe('New IPA, or null to rebuild automatically'),
        transcriptionAlt: z.string().nullable().optional().describe('Spanish only: new Spain IPA, or null to rebuild automatically'),
        set: z.string().optional().describe('Move to this set (name or id), or "none"')
      }
    },
    ({ id, set, ...fields }) =>
      run(async () => {
        const card = await client.request<ApiCard & { language: string }>('GET', `/cards/${encodeURIComponent(id)}`)
        const setId = await resolveSet(card.language, set)
        return client.request('PATCH', `/cards/${encodeURIComponent(id)}`, { ...fields, ...(setId !== undefined ? { setId } : {}) })
      })
  )

  server.registerTool(
    'move_cards',
    {
      title: 'Move cards',
      description: 'Move cards to a set, or to "none" (no set). Learning progress is kept.',
      inputSchema: { language, card_ids: z.array(z.string()).min(1), set: z.string().describe('Set name or id, or "none"') },
      annotations: { idempotentHint: true }
    },
    ({ language: lang, card_ids, set }) =>
      run(async () => {
        const setId = await resolveSet(lang, set)
        const result = await client.request<{ cards: ApiCard[] }>('POST', '/cards/move', { cardIds: card_ids, setId: setId ?? null })
        return { moved: result.cards.length }
      })
  )

  server.registerTool(
    'create_set',
    {
      title: 'Create set',
      description: 'Create a new word set in a language.',
      inputSchema: { language, name: z.string(), description: z.string().optional() }
    },
    ({ language: lang, name, description }) => run(() => client.request('POST', '/sets', { language: lang, name, description: description ?? null }))
  )

  server.registerTool(
    'update_set',
    {
      title: 'Rename set',
      description: 'Rename a set or change its description. Pass the version from list_sets.',
      inputSchema: { set_id: z.string(), version: z.number().int(), name: z.string().optional(), description: z.string().nullable().optional() }
    },
    ({ set_id, ...fields }) => run(() => client.request('PATCH', `/sets/${encodeURIComponent(set_id)}`, fields))
  )

  server.registerTool(
    'delete_set',
    {
      title: 'Delete set',
      description:
        'Delete a set. ALWAYS ask the user first and let them choose: "keep-cards" moves the cards to no set with their progress, ' +
        '"delete-cards" deletes the cards and their progress permanently.',
      inputSchema: { set_id: z.string(), policy: z.enum(['keep-cards', 'delete-cards']) },
      annotations: { destructiveHint: true }
    },
    ({ set_id, policy }) => run(() => client.request('DELETE', `/sets/${encodeURIComponent(set_id)}?policy=${policy}`))
  )

  server.registerTool(
    'delete_card',
    {
      title: 'Delete card',
      description: 'Delete a card together with its learning progress. ALWAYS ask the user first — this cannot be undone.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true }
    },
    ({ id }) =>
      run(async () => {
        await client.request('DELETE', `/cards/${encodeURIComponent(id)}`)
        return { deleted: id }
      })
  )

  return server
}
