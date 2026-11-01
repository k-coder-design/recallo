import type { ApiContract, ApiMethod, BridgeApi } from '../shared/api'
import type { Result } from '../shared/types'
import { openFile, saveFile } from './files'

/**
 * window.recallo в телефонной сборке: на Mac вызовы идут в main-процесс Electron через IPC,
 * здесь — в Web Worker, где работают ядро и база SQLite (D57). Интерфейс не отличает одно от другого.
 */
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, (result: Result<unknown>) => void>()
let nextId = 0

worker.addEventListener('message', (event: MessageEvent<{ id: number; result: Result<unknown> }>) => {
  const { id, result } = event.data
  pending.get(id)?.(result)
  pending.delete(id)
})

worker.addEventListener('error', (event) => {
  // Worker не загрузился: ответить ошибкой всем ждущим вызовам, а не оставить экран висеть.
  for (const resolve of pending.values()) {
    resolve({ ok: false, error: { code: 'INTERNAL', message: `Recallo could not start: ${event.message}` } })
  }
  pending.clear()
})

/** Вызов Worker: методы API и служебные методы телефона (`phone.*`, см. worker.ts). */
function callWorker(method: string, args: unknown[]): Promise<Result<unknown>> {
  return new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    worker.postMessage({ id, method, args })
  })
}

/**
 * Методы, которым нужна страница, а не Worker: меню «Поделиться» и выбор файлов работают
 * только в окне и только сразу после нажатия. Файл готовит ядро в Worker, сохраняет — страница.
 */
const inPage: Partial<Record<ApiMethod, (...args: unknown[]) => Promise<Result<unknown>>>> = {
  'transfer.openFile': (kind) => inPageResult(() => openFile(kind as 'import' | 'backup')),
  'transfer.backup': () => saveFromWorker('phone.backupFile', [], 'application/json'),
  'transfer.export': (spaceId, scope, format) =>
    saveFromWorker('phone.exportFile', [spaceId, scope, format], format === 'csv' ? 'text/csv' : 'application/json')
}

/** Файл готовит ядро в Worker ({ filename, content }), сохраняет страница (saveFile). */
async function saveFromWorker(method: string, args: unknown[], type: string): Promise<Result<unknown>> {
  const file = await callWorker(method, args)
  if (!file.ok) return file
  const { filename, content } = file.data as { filename: string; content: string }
  return inPageResult(() => saveFile(filename, content, type))
}

async function inPageResult(action: () => Promise<unknown>): Promise<Result<unknown>> {
  try {
    return { ok: true, data: await action() }
  } catch (error) {
    return { ok: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Something went wrong' } }
  }
}

const bridge: BridgeApi = {
  invoke: <M extends ApiMethod>(method: M, ...args: Parameters<ApiContract[M]>) => {
    const local = inPage[method]
    return (local ? local(...args) : callWorker(method, args)) as Promise<Result<ReturnType<ApiContract[M]>>>
  }
}

window.recallo = bridge
