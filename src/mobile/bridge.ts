import type { ApiContract, ApiMethod, BridgeApi } from '../shared/api'
import type { Result } from '../shared/types'
import { openFile, saveFile } from './files'

/**
 * window.recallo in the phone build: on the Mac calls go to the Electron main process via IPC,
 * here — to a Web Worker that runs the core and the SQLite database (D57). The interface cannot tell the difference.
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
  // The Worker failed to load: answer all waiting calls with an error instead of leaving the screen hanging.
  for (const resolve of pending.values()) {
    resolve({ ok: false, error: { code: 'INTERNAL', message: `Recallo could not start: ${event.message}` } })
  }
  pending.clear()
})

/** A Worker call: API methods and phone helper methods (`phone.*`, see worker.ts). */
function callWorker(method: string, args: unknown[]): Promise<Result<unknown>> {
  return new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    worker.postMessage({ id, method, args })
  })
}

/**
 * Methods that need the page, not the Worker: the Share sheet and the file picker work
 * only in the window and only right after a tap. The core in the Worker prepares the file, the page saves it.
 */
const inPage: Partial<Record<ApiMethod, (...args: unknown[]) => Promise<Result<unknown>>>> = {
  'transfer.openFile': (kind) => inPageResult(() => openFile(kind as 'import' | 'backup')),
  'transfer.backup': () => saveFromWorker('phone.backupFile', [], 'application/json'),
  'transfer.export': (spaceId, scope, format) =>
    saveFromWorker('phone.exportFile', [spaceId, scope, format], format === 'csv' ? 'text/csv' : 'application/json')
}

/** The core in the Worker prepares the file ({ filename, content }), the page saves it (saveFile). */
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
