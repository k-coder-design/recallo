import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { isApiMethod, type ApiHandlers } from '../shared/api'
import type { ExportFormat, Result, SetScope, SpaceId } from '../shared/types'
import { openWasmDatabase } from '../main/db/wasm'
import { DomainError, toAppError } from '../main/domain/errors'
import { SettingsService } from '../main/domain/settings'
import { createHandlers, createServices, type AgentApi, type Files, type Services } from '../main/services'

/**
 * The Recallo core on the phone (D57): the same domain services as on the Mac, on SQLite WebAssembly.
 * The database is stored in OPFS via the "opfs-sahpool" VFS: it needs no COOP/COEP headers,
 * which GitHub Pages does not send. Calls come from the window.recallo bridge (bridge.ts).
 */
const DB_FILE = '/recallo.sqlite'

/** The Worker global object: only what is needed here (DOM and WebWorker types conflict in one build). */
const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<{ id: number; method: unknown; args: unknown[] }>) => void): void
  postMessage(message: unknown): void
}

/** Some phone features are handled elsewhere; until then — a clear error. */
const later = (what: string): never => {
  throw new DomainError('VALIDATION', `${what} is not available on iPhone yet`)
}

/** MCP and the Agent API exist only on the Mac: on the phone the section is always off. */
const agentApi: AgentApi = {
  state: () => ({
    enabled: false,
    port: 0,
    token: '',
    status: 'stopped',
    error: null,
    url: null,
    connection: { claudeCode: '', claudeDesktop: '', claudeDesktopConfigPath: '' }
  }),
  update: () => later('The agent API'),
  regenerateToken: () => later('The agent API')
}


/**
 * Phone helper methods are not part of the app API: only the bridge (bridge.ts) calls them
 * when the Worker and the page share the work: the core prepares the file here, the page saves it (Share sheet).
 */
const phoneMethods = (services: Services): Record<string, (...args: unknown[]) => unknown> => ({
  'phone.backupFile': () => services.transfer.backup(),
  'phone.exportFile': (spaceId, scope, format) =>
    services.transfer.exportDictionary(spaceId as SpaceId, scope as SetScope | undefined, format as ExportFormat)
})

/**
 * Files on the phone: the page picks and saves them (bridge.ts intercepts these calls),
 * here — only restore. There is no copy of the current database before a restore on the phone:
 * Settings suggests making a backup with the Backup button first.
 */
const phoneFiles = (services: Services): Files => ({
  open: async () => later('Opening files from the core'),
  exportDictionary: async () => later('Export from the core'),
  backup: async () => later('Backup from the core'),
  restore: async (content) => ({ ...services.transfer.restore(content), safetyCopy: '' })
})

async function start(): Promise<{ handlers: ApiHandlers; phone: ReturnType<typeof phoneMethods> }> {
  const sqlite3 = await sqlite3InitModule()
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'recallo' })
  const db = openWasmDatabase(sqlite3, () => new pool.OpfsSAHPoolDb(DB_FILE))
  const services = createServices(db)
  const settings = new SettingsService(db)
  const handlers = createHandlers(
    services,
    agentApi,
    phoneFiles(services),
    { theme: () => settings.theme(), setTheme: (value) => settings.setTheme(value) },
    {
      // No automatic backup to a folder on the phone — the Backup button instead (W4).
      state: async () => ({ enabled: false, lastAt: null, lastError: null, folder: '', count: 0 }),
      setEnabled: async () => later('Automatic backup'),
      showFolder: () => undefined
    }
  )
  return { handlers, phone: phoneMethods(services) }
}

const ready = start()

scope.addEventListener('message', async (event) => {
  const { id, method, args } = event.data
  let result: Result<unknown>
  try {
    const { handlers, phone } = await ready
    const handler =
      typeof method === 'string' && Object.hasOwn(phone, method)
        ? phone[method]
        : isApiMethod(method)
          ? (handlers[method] as (...params: unknown[]) => unknown)
          : undefined
    if (!handler) throw new DomainError('NOT_FOUND', 'Unknown method', { method })
    result = { ok: true, data: await handler(...args) }
  } catch (error) {
    result = { ok: false, error: toAppError(error) }
  }
  scope.postMessage({ id, result })
})
