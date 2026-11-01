import { ipcMain } from 'electron'
import { API_CHANNEL, isApiMethod, type ApiHandlers } from '../shared/api'
import type { Result } from '../shared/types'
import { toAppError } from './domain/errors'

export function registerIpc(handlers: ApiHandlers): void {
  ipcMain.handle(API_CHANNEL, async (_event, method: unknown, args: unknown): Promise<Result<unknown>> => {
    if (!isApiMethod(method) || !Array.isArray(args)) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown method', details: { method } } }
    }
    try {
      const handler = handlers[method] as (...params: unknown[]) => unknown
      return { ok: true, data: await handler(...args) }
    } catch (error) {
      return { ok: false, error: toAppError(error) }
    }
  })
}
