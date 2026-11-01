import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type NativeDb } from '../main/db/database'
import { SettingsService } from '../main/domain/settings'
import { LocalApiServer } from '../main/api/http'
import { createRoutes } from '../main/api/routes'
import { createServices, type Services } from '../main/services'
import { RecalloClient } from './client'
import { createRecalloServer } from './tools'

let db: NativeDb
let services: Services
let api: LocalApiServer
let dir: string
let connectionFile: string
let client: Client

beforeEach(async () => {
  db = openDatabase(':memory:')
  services = createServices(db, { scheduler: { fuzz: false } })
  const settings = new SettingsService(db)
  api = new LocalApiServer(createRoutes(services, { version: 'test' }), db, () => settings.agentApi().token)
  const port = await api.start(0)
  dir = mkdtempSync(join(tmpdir(), 'recallo-mcp-'))
  connectionFile = join(dir, 'agent-api.json')
  writeFileSync(connectionFile, JSON.stringify({ url: `http://127.0.0.1:${port}`, token: settings.agentApi().token }))

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createRecalloServer(new RecalloClient(connectionFile), 'test').connect(serverSide)
  client = new Client({ name: 'test-agent', version: '1.0.0' })
  await client.connect(clientSide)
})

afterEach(async () => {
  await client.close()
  await api.stop()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean }
  const raw = result.content[0]?.text ?? ''
  let data: any = raw
  try {
    data = JSON.parse(raw)
  } catch {
    // Текстовое сообщение (например, Recallo закрыт).
  }
  return { isError: result.isError === true, data }
}

describe('MCP-сервер Recallo', () => {
  it('предлагает инструменты для работы со словарём и помечает удаляющие', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['add_cards', 'create_set', 'delete_card', 'delete_set', 'get_card', 'list_sets', 'move_cards', 'search_cards', 'update_card', 'update_set'].sort()
    )
    expect(tools.find((t) => t.name === 'delete_set')?.annotations?.destructiveHint).toBe(true)
    expect(tools.find((t) => t.name === 'search_cards')?.annotations?.readOnlyHint).toBe(true)
  })

  it('добавляет слова в набор по названию, пропускает дубли и находит их', async () => {
    services.cards.create({ spaceId: 'en', term: 'dull', meaning: 'скучный' })
    const missing = await call('add_cards', { language: 'English', set: 'Movie', cards: [{ term: 'gripping', meaning: 'захватывающий' }] })
    expect(missing.isError).toBe(true)
    expect(missing.data.error.code).toBe('SET_NOT_FOUND')

    await call('create_set', { language: 'en', name: 'Movie' })
    const added = await call('add_cards', {
      language: 'en',
      set: 'movie',
      cards: [
        { term: 'gripping', meaning: 'захватывающий', examples: [{ text: "It's a gripping thriller." }] },
        { term: 'Dull', meaning: 'скучный' }
      ]
    })
    expect(added.isError).toBe(false)
    expect(added.data.summary).toEqual({ created: 1, duplicates: 1, errors: 0 })
    expect(added.data.results[0]).toMatchObject({ status: 'created', term: 'gripping', transcription: 'ˈɡrɪpɪŋ' })

    const found = await call('search_cards', { language: 'en', query: 'захват' })
    expect(found.data.cards).toEqual([expect.objectContaining({ term: 'gripping', set: 'Movie', version: 1 })])
  })

  it('правит карточку по версии и переносит между наборами, сохраняя прогресс', async () => {
    const card = services.cards.create({ spaceId: 'en', term: 'dull', meaning: 'скучный' })
    await call('create_set', { language: 'en', name: 'Movie' })

    const updated = await call('update_card', { id: card.id, version: 1, meaning: 'скучный, нудный', set: 'Movie' })
    expect(updated.data).toMatchObject({ meaning: 'скучный, нудный', version: 2 })
    const stale = await call('update_card', { id: card.id, version: 1, meaning: 'серый' })
    expect(stale.isError).toBe(true)
    expect(stale.data.error.code).toBe('CONFLICT')

    expect((await call('move_cards', { language: 'en', card_ids: [card.id], set: 'none' })).data).toEqual({ moved: 1 })
    expect(services.cards.get(card.id).setId).toBeNull()
  })

  it('удаляет набор только с явно выбранной политикой', async () => {
    const set = (await call('create_set', { language: 'en', name: 'Movie' })).data
    services.cards.create({ spaceId: 'en', setId: set.id, term: 'dull', meaning: 'скучный' })
    const withoutPolicy = await call('delete_set', { set_id: set.id })
    expect(withoutPolicy.isError).toBe(true)
    expect((await call('delete_set', { set_id: set.id, policy: 'keep-cards' })).data).toEqual({ affectedCards: 1 })
    expect(services.cards.list('en')).toHaveLength(1)
  })

  it('понятно сообщает, если Recallo закрыт или API выключен', async () => {
    rmSync(connectionFile)
    const result = await call('list_sets', { language: 'en' })
    expect(result.isError).toBe(true)
    expect(result.data).toContain('open Recallo and turn on Settings → Agent API')
  })
})
