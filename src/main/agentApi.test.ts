import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentApiController } from './agentApi'
import { LocalApiServer } from './api/http'
import { createRoutes } from './api/routes'
import { openDatabase, type NativeDb } from './db/database'
import { SettingsService } from './domain/settings'
import { createServices } from './services'

let db: NativeDb
let dir: string
let controller: AgentApiController

beforeEach(() => {
  db = openDatabase(':memory:')
  dir = mkdtempSync(join(tmpdir(), 'recallo-agent-'))
  const settings = new SettingsService(db)
  const server = new LocalApiServer(createRoutes(createServices(db), { version: 'test' }), db, () => settings.agentApi().token)
  controller = new AgentApiController(settings, server, join(dir, 'agent-api.json'), {
    command: '/Applications/Recallo.app/Contents/MacOS/Recallo',
    script: '/Applications/Recallo.app/Contents/Resources/app.asar/out/mcp/index.cjs'
  })
})

afterEach(async () => {
  await controller.shutdown()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('AgentApiController', () => {
  it('is off by default and does not create the connection file', async () => {
    const state = await controller.sync()
    expect(state).toMatchObject({ enabled: false, status: 'stopped', url: null })
    expect(existsSync(join(dir, 'agent-api.json'))).toBe(false)
  })

  it('when enabled starts the API and writes the connection file for the owner only', async () => {
    const state = await controller.update({ enabled: true, port: 47999 })
    expect(state.status).toBe('running')
    const file = join(dir, 'agent-api.json')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(((await (await fetch(`${state.url}/api/v1/health`)).json()) as { ok: boolean }).ok).toBe(true)

    const off = await controller.update({ enabled: false })
    expect(off.status).toBe('stopped')
    expect(existsSync(file)).toBe(false)
  })

  it('reports a busy port', async () => {
    const { createServer } = await import('node:net')
    const blocker = createServer().listen(47998, '127.0.0.1')
    await new Promise((r) => blocker.once('listening', r))
    try {
      const state = await controller.update({ enabled: true, port: 47998 })
      expect(state.status).toBe('error')
      expect(state.error).toContain('Port 47998 is already used')
    } finally {
      blocker.close()
    }
  })

  it('gives a working Claude Code command: the server name before -e, the command after --', () => {
    expect(controller.state().connection.claudeCode).toBe(
      'claude mcp add --scope user recallo -e ELECTRON_RUN_AS_NODE=1 -- "/Applications/Recallo.app/Contents/MacOS/Recallo" "/Applications/Recallo.app/Contents/Resources/app.asar/out/mcp/index.cjs"'
    )
    const desktop = JSON.parse(controller.state().connection.claudeDesktop)
    expect(desktop.mcpServers.recallo).toEqual({
      command: '/Applications/Recallo.app/Contents/MacOS/Recallo',
      args: ['/Applications/Recallo.app/Contents/Resources/app.asar/out/mcp/index.cjs'],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    })
  })
})
