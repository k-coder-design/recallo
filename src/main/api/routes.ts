import { z } from 'zod'
import type { Card, CardSet } from '../../shared/types'
import { findMaskRanges } from '../../shared/masking'
import { toAppError } from '../domain/errors'
import type { Services } from '../services'
import { HttpError, type ApiRequest, type Route } from './http'
import { buildOpenApi } from './openapi'

/** Карточка для агента: содержимое и данные для скрытия слова в примерах (API-18), без прогресса и истории (API-17). */
export function cardDto(card: Card) {
  return {
    id: card.id,
    language: card.spaceId,
    setId: card.setId,
    term: card.term,
    transcription: card.transcription,
    transcriptionAlt: card.transcriptionAlt,
    meaning: card.meaning,
    emoji: card.emoji,
    examples: card.examples.map((e) => ({
      text: e.text,
      translation: e.translation,
      maskFragments: e.maskFragments,
      maskedRanges: findMaskRanges(e.text, card.term, e.maskFragments, card.spaceId)
    })),
    version: card.version,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt
  }
}

export function setDto(set: CardSet) {
  return {
    id: set.id,
    language: set.spaceId,
    name: set.name,
    description: set.description,
    cardCount: set.cardCount,
    version: set.version,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt
  }
}

const languageSchema = z.enum(['en', 'es'], { error: 'language must be "en" or "es"' })
const exampleSchema = z.object({
  text: z.string(),
  translation: z.string().nullish(),
  maskFragments: z.array(z.string()).optional()
})
const cardFields = {
  setId: z.string().nullish(),
  term: z.string(),
  meaning: z.string(),
  transcription: z.string().nullish(),
  transcriptionAlt: z.string().nullish(),
  emoji: z.string().nullish(),
  examples: z.array(exampleSchema).optional()
}
const cardCreateBody = z.object({ language: languageSchema, ...cardFields, allowDuplicates: z.boolean().optional() })
const batchCreateBody = z.object({
  language: languageSchema,
  setId: z.string().nullish(),
  allowDuplicates: z.boolean().optional(),
  cards: z
    .array(z.object({ ...cardFields, setId: z.string().nullish() }))
    .min(1, 'cards must not be empty')
    .max(200, 'Send at most 200 cards per request')
})
const cardPatchBody = z.object({
  version: z.number().int().optional(),
  setId: z.string().nullish(),
  term: z.string().optional(),
  meaning: z.string().optional(),
  transcription: z.string().nullish(),
  transcriptionAlt: z.string().nullish(),
  emoji: z.string().nullish(),
  examples: z.array(exampleSchema).optional(),
  resetProgress: z.boolean().optional()
})
const batchUpdateBody = z.object({
  updates: z
    .array(cardPatchBody.extend({ id: z.string(), version: z.number().int() }))
    .min(1, 'updates must not be empty')
    .max(200, 'Send at most 200 updates per request')
})
const moveBody = z.object({ cardIds: z.array(z.string()).min(1).max(500), setId: z.string().nullable() })
const setCreateBody = z.object({ language: languageSchema, name: z.string(), description: z.string().nullish() })
const setPatchBody = z.object({ version: z.number().int().optional(), name: z.string().optional(), description: z.string().nullish() })

/** Версия для защиты от перезаписи (API-15): из тела или из заголовка If-Match: "3". */
function versionOf(req: ApiRequest, bodyVersion: number | undefined): number {
  if (bodyVersion !== undefined) return bodyVersion
  const header = String(req.headers['if-match'] ?? '').trim()
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(header)
  if (match) return Number(match[1])
  throw new HttpError(428, 'VERSION_REQUIRED', 'Send the current version in the body ("version") or as an If-Match header')
}

const etag = (version: number) => ({ ETag: `"${version}"` })

function requireLanguage(req: ApiRequest) {
  return languageSchema.parse(req.query.get('language') ?? undefined)
}

export function createRoutes({ cards, sets }: Services, info: { version: string }): Route[] {
  const openApi = buildOpenApi(info.version)

  return [
    { method: 'GET', path: '/api/v1/health', public: true, handle: () => ({ body: { ok: true, app: 'Recallo', version: info.version } }) },
    { method: 'GET', path: '/api/v1/openapi.json', public: true, handle: () => ({ body: openApi }) },

    { method: 'GET', path: '/api/v1/languages', handle: () => ({ body: cards.listSpaces().map((s) => ({ id: s.id, name: s.name })) }) },

    // Наборы
    { method: 'GET', path: '/api/v1/sets', handle: (req) => ({ body: sets.list(requireLanguage(req)).map(setDto) }) },
    {
      method: 'POST',
      path: '/api/v1/sets',
      handle: (req) => {
        const body = setCreateBody.parse(req.body)
        const set = sets.create({ spaceId: body.language, name: body.name, description: body.description ?? null })
        return { status: 201, body: setDto(set), headers: etag(set.version) }
      }
    },
    {
      method: 'GET',
      path: '/api/v1/sets/:id',
      handle: (req) => {
        const set = sets.get(req.params['id'] as string)
        return { body: setDto(set), headers: etag(set.version) }
      }
    },
    {
      method: 'PATCH',
      path: '/api/v1/sets/:id',
      handle: (req) => {
        const body = setPatchBody.parse(req.body ?? {})
        const set = sets.update(req.params['id'] as string, {
          version: versionOf(req, body.version),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {})
        })
        return { body: setDto(set), headers: etag(set.version) }
      }
    },
    {
      // Политика обязательна: без неё карточки набора не удаляются неявно (SET-11).
      method: 'DELETE',
      path: '/api/v1/sets/:id',
      handle: (req) => ({ body: sets.delete(req.params['id'] as string, req.query.get('policy') ?? undefined) })
    },

    // Карточки
    {
      method: 'GET',
      path: '/api/v1/cards',
      handle: (req) => {
        const language = requireLanguage(req)
        const set = req.query.get('set')
        const limit = Math.min(Math.max(Number(req.query.get('limit') ?? 200) || 200, 1), 1000)
        const offset = Math.max(Number(req.query.get('offset') ?? 0) || 0, 0)
        const all = cards.list(language, {
          scope: !set ? { kind: 'all' } : set === 'none' ? { kind: 'none' } : { kind: 'set', setId: set },
          ...(req.query.get('search') ? { search: req.query.get('search') as string } : {})
        })
        return { body: { total: all.length, limit, offset, cards: all.slice(offset, offset + limit).map(cardDto) } }
      }
    },
    {
      method: 'POST',
      path: '/api/v1/cards',
      handle: (req) => {
        const { language, allowDuplicates, ...fields } = cardCreateBody.parse(req.body)
        if (!allowDuplicates) {
          const existing = cards.findDuplicates(language, fields.term)
          if (existing.length > 0) {
            throw new HttpError(409, 'DUPLICATE', `“${fields.term}” already exists. Send "allowDuplicates": true to add it anyway.`, { existing })
          }
        }
        const card = cards.create({ spaceId: language, ...fields })
        return { status: 201, body: cardDto(card), headers: etag(card.version) }
      }
    },
    {
      // Массовое создание: результат по каждой карточке, частичные ошибки не скрываются (API-06, API-13).
      method: 'POST',
      path: '/api/v1/cards/batch',
      handle: (req) => {
        const { language, setId, allowDuplicates, cards: items } = batchCreateBody.parse(req.body)
        const results = items.map((item, index) => {
          try {
            if (!allowDuplicates) {
              const existing = cards.findDuplicates(language, item.term)
              if (existing.length > 0) return { index, status: 'duplicate' as const, term: item.term, existing }
            }
            const card = cards.create({ spaceId: language, ...item, setId: item.setId !== undefined ? item.setId : (setId ?? null) })
            return { index, status: 'created' as const, card: cardDto(card) }
          } catch (error) {
            return { index, status: 'error' as const, term: item.term, error: toAppError(error) }
          }
        })
        const count = (status: string) => results.filter((r) => r.status === status).length
        return { body: { summary: { created: count('created'), duplicates: count('duplicate'), errors: count('error') }, results } }
      }
    },
    {
      method: 'PATCH',
      path: '/api/v1/cards/batch',
      handle: (req) => {
        const { updates } = batchUpdateBody.parse(req.body)
        const results = updates.map(({ id, ...patch }, index) => {
          try {
            return { index, id, status: 'updated' as const, card: cardDto(cards.update(id, patch)) }
          } catch (error) {
            return { index, id, status: 'error' as const, error: toAppError(error) }
          }
        })
        const updated = results.filter((r) => r.status === 'updated').length
        return { body: { summary: { updated, errors: results.length - updated }, results } }
      }
    },
    {
      method: 'POST',
      path: '/api/v1/cards/move',
      handle: (req) => {
        const { cardIds, setId } = moveBody.parse(req.body)
        return { body: { cards: cards.moveToSet(cardIds, setId).map(cardDto) } }
      }
    },
    {
      method: 'GET',
      path: '/api/v1/cards/:id',
      handle: (req) => {
        const card = cards.get(req.params['id'] as string)
        return { body: cardDto(card), headers: etag(card.version) }
      }
    },
    {
      method: 'PATCH',
      path: '/api/v1/cards/:id',
      handle: (req) => {
        const body = cardPatchBody.parse(req.body ?? {})
        const card = cards.update(req.params['id'] as string, { ...body, version: versionOf(req, body.version) })
        return { body: cardDto(card), headers: etag(card.version) }
      }
    },
    {
      method: 'DELETE',
      path: '/api/v1/cards/:id',
      handle: (req) => {
        cards.delete(req.params['id'] as string)
        return { status: 204 }
      }
    }
  ]
}
