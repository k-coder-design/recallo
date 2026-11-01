import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { isApiMethod, type ApiHandlers } from '../shared/api'
import type { ExportFormat, Result, SetScope, SpaceId } from '../shared/types'
import { openWasmDatabase } from '../main/db/wasm'
import { DomainError, toAppError } from '../main/domain/errors'
import { SettingsService } from '../main/domain/settings'
import { createHandlers, createServices, type AgentApi, type Files, type Services } from '../main/services'

/**
 * Ядро Recallo на телефоне (D57): те же сервисы домена, что на Mac, на SQLite WebAssembly.
 * База хранится в OPFS через VFS «opfs-sahpool»: ему не нужны заголовки COOP/COEP,
 * которых нет на GitHub Pages. Вызовы приходят от моста window.recallo (bridge.ts).
 */
const DB_FILE = '/recallo.sqlite'

/** Глобальный объект Worker: только то, что нужно здесь (типы DOM и WebWorker в одной сборке конфликтуют). */
const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<{ id: number; method: unknown; args: unknown[] }>) => void): void
  postMessage(message: unknown): void
}

/** Отдельные возможности телефона появятся на этапах W1–W4; пока — понятная ошибка. */
const later = (what: string): never => {
  throw new DomainError('VALIDATION', `${what} is not available on iPhone yet`)
}

/** MCP и Agent API есть только на Mac: на телефоне раздел всегда выключен. */
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
 * Служебные методы телефона — не часть API приложения: их вызывает только мост (bridge.ts),
 * когда работу делят Worker и страница: файл готовит ядро здесь, а сохраняет страница (меню «Поделиться»).
 */
const phoneMethods = (services: Services): Record<string, (...args: unknown[]) => unknown> => ({
  'phone.backupFile': () => services.transfer.backup(),
  'phone.exportFile': (spaceId, scope, format) =>
    services.transfer.exportDictionary(spaceId as SpaceId, scope as SetScope | undefined, format as ExportFormat)
})

/**
 * Файлы на телефоне: выбор и сохранение делает страница (bridge.ts перехватывает эти вызовы),
 * здесь — только восстановление. Копии текущей базы перед восстановлением на телефоне нет:
 * Settings предлагает сначала сделать копию кнопкой Backup.
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
      // Автокопии в папку на телефоне нет — вместо неё кнопка Backup (W4).
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
