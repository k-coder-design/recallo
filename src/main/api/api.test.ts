import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type NativeDb } from '../db/database'
import { SettingsService } from '../domain/settings'
import { createServices, type Services } from '../services'
import { LocalApiServer } from './http'
import { createRoutes } from './routes'

let db: NativeDb
let services: Services
let server: LocalApiServer
let base: string
let token: string

beforeEach(async () => {
  db = openDatabase(':memory:')
  services = createServices(db, { scheduler: { fuzz: false } })
  const settings = new SettingsService(db)
  token = settings.agentApi().token
  server = new LocalApiServer(createRoutes(services, { version: 'test' }), db, () => settings.agentApi().token)
  const port = await server.start(0)
  base = `http://127.0.0.1:${port}/api/v1`
})

afterEach(async () => {
  await server.stop()
  db.close()
})

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
  const text = await res.text()
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as any) : undefined }
}

describe('REST API: доступ', () => {
  it('без токена или с чужим токеном отвечает 401, health и описание доступны без токена', async () => {
    expect((await fetch(`${base}/languages`)).status).toBe(401)
    expect((await api('GET', '/languages', undefined, { Authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await fetch(`${base}/health`)).status).toBe(200)
    const doc = (await (await fetch(`${base}/openapi.json`)).json()) as { openapi: string; paths: Record<string, unknown> }
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths)).toContain('/api/v1/cards/batch')
  })

  it('отклоняет чужой Host (защита от DNS rebinding) и не отдаёт CORS-заголовков', async () => {
    const { request } = await import('node:http')
    const status = await new Promise<number>((resolve) => {
      const url = new URL(`${base}/health`)
      request({ host: '127.0.0.1', port: url.port, path: url.pathname, headers: { Host: 'evil.example:80' } }, (res) => resolve(res.statusCode ?? 0)).end()
    })
    expect(status).toBe(403)
    const res = await api('GET', '/languages')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('возвращает ошибки в стабильной структуре', async () => {
    const res = await api('GET', '/cards/missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Card not found', details: { id: 'missing' } } })
    expect((await api('GET', '/cards')).body.error.code).toBe('VALIDATION')
  })
})

describe('REST API: наборы и карточки', () => {
  it('создаёт набор и карточку, отдаёт данные для маскирования и не отдаёт прогресс', async () => {
    const set = await api('POST', '/sets', { language: 'en', name: 'Movie' })
    expect(set.status).toBe(201)
    const card = await api('POST', '/cards', {
      language: 'en',
      setId: set.body.id,
      term: 'gripping',
      meaning: 'захватывающий',
      examples: [{ text: "It's a gripping thriller." }]
    })
    expect(card.status).toBe(201)
    expect(card.headers.get('etag')).toBe('"1"')
    expect(card.body).toMatchObject({ term: 'gripping', setId: set.body.id, transcription: 'ˈɡrɪpɪŋ', version: 1 })
    expect(card.body.examples[0].maskedRanges).toEqual([[7, 15]])
    expect(card.body).not.toHaveProperty('progress')

    const list = await api('GET', `/cards?language=en&set=${set.body.id}`)
    expect(list.body.total).toBe(1)
    expect((await api('GET', '/cards?language=en&search=ЗАХВАТ')).body.cards[0].term).toBe('gripping')
  })

  it('не создаёт дубль молча: 409 DUPLICATE, а с allowDuplicates — создаёт', async () => {
    await api('POST', '/cards', { language: 'en', term: 'dull', meaning: 'скучный' })
    const dup = await api('POST', '/cards', { language: 'en', term: 'Dull', meaning: 'скучный' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('DUPLICATE')
    expect(dup.body.error.details.existing[0].term).toBe('dull')
    expect((await api('POST', '/cards', { language: 'en', term: 'Dull', meaning: 'тупой', allowDuplicates: true })).status).toBe(201)
  })

  it('массовое создание отчитывается по каждой карточке и не скрывает частичные ошибки', async () => {
    await api('POST', '/cards', { language: 'en', term: 'dull', meaning: 'скучный' })
    const res = await api('POST', '/cards/batch', {
      language: 'en',
      cards: [
        { term: 'gripping', meaning: 'захватывающий' },
        { term: 'dull', meaning: 'скучный' },
        { term: 'hilarious', meaning: '' }
      ]
    })
    expect(res.status).toBe(200)
    expect(res.body.summary).toEqual({ created: 1, duplicates: 1, errors: 1 })
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['created', 'duplicate', 'error'])
    expect(res.body.results[2].error.code).toBe('VALIDATION')
  })

  it('защищает от перезаписи свежей версии и требует версию', async () => {
    const card = (await api('POST', '/cards', { language: 'en', term: 'dull', meaning: 'скучный' })).body
    expect((await api('PATCH', `/cards/${card.id}`, { meaning: 'нудный' })).status).toBe(428)
    expect((await api('PATCH', `/cards/${card.id}`, { meaning: 'нудный' }, { 'If-Match': '"1"' })).body.version).toBe(2)
    const stale = await api('PATCH', `/cards/${card.id}`, { version: 1, meaning: 'серый' })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('CONFLICT')
  })

  it('массово обновляет карточки с результатом по каждой', async () => {
    const card = (await api('POST', '/cards', { language: 'en', term: 'dull', meaning: 'скучный' })).body
    const res = await api('PATCH', '/cards/batch', {
      updates: [
        { id: card.id, version: 1, emoji: '😴' },
        { id: 'missing', version: 1, emoji: '🎬' }
      ]
    })
    expect(res.body.summary).toEqual({ updated: 1, errors: 1 })
    expect(res.body.results[0].card.emoji).toBe('😴')
    expect(res.body.results[1].error.code).toBe('NOT_FOUND')
  })

  it('удаляет набор только с явной политикой', async () => {
    const set = (await api('POST', '/sets', { language: 'en', name: 'Movie' })).body
    const card = (await api('POST', '/cards', { language: 'en', setId: set.id, term: 'dull', meaning: 'скучный' })).body
    expect((await api('DELETE', `/sets/${set.id}`)).status).toBe(400)
    expect((await api('DELETE', `/sets/${set.id}?policy=keep-cards`)).body).toEqual({ affectedCards: 1 })
    expect((await api('GET', `/cards/${card.id}`)).body.setId).toBeNull()
  })

  it('переносит карточки между наборами', async () => {
    const set = (await api('POST', '/sets', { language: 'en', name: 'Movie' })).body
    const card = (await api('POST', '/cards', { language: 'en', term: 'dull', meaning: 'скучный' })).body
    const moved = await api('POST', '/cards/move', { cardIds: [card.id], setId: set.id })
    expect(moved.body.cards[0].setId).toBe(set.id)
  })
})

describe('REST API: идемпотентность', () => {
  it('повтор запроса с тем же ключом не создаёт дубль и возвращает тот же ответ', async () => {
    const body = { language: 'en', term: 'dull', meaning: 'скучный' }
    const first = await api('POST', '/cards', body, { 'Idempotency-Key': 'key-1' })
    const second = await api('POST', '/cards', body, { 'Idempotency-Key': 'key-1' })
    expect(second.status).toBe(201)
    expect(second.body.id).toBe(first.body.id)
    expect(second.headers.get('idempotent-replayed')).toBe('true')
    expect(services.cards.list('en')).toHaveLength(1)
  })

  it('тот же ключ с другим телом — 422', async () => {
    await api('POST', '/cards', { language: 'en', term: 'dull', meaning: 'скучный' }, { 'Idempotency-Key': 'key-2' })
    const res = await api('POST', '/cards', { language: 'en', term: 'gripping', meaning: 'захватывающий' }, { 'Idempotency-Key': 'key-2' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('IDEMPOTENCY_MISMATCH')
  })
})
