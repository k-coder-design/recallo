import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Где Recallo оставляет адрес API и токен, пока Agent API включён. */
export function defaultConnectionFile(): string {
  return process.env['RECALLO_CONNECTION_FILE'] ?? join(homedir(), 'Library/Application Support/Recallo/agent-api.json')
}

export class RecalloUnavailableError extends Error {}

/** Ошибка API Recallo с кодом из тела ответа (API-12). */
export class RecalloApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
  }
}

const NOT_RUNNING = 'Recallo is not running or its Agent API is turned off. Ask the user to open Recallo and turn on Settings → Agent API, then try again.'

/**
 * Клиент локального API Recallo. Файл подключения читается заново на каждый вызов:
 * смена порта или токена в Settings подхватывается без перезапуска агента.
 */
export class RecalloClient {
  constructor(private readonly connectionFile = defaultConnectionFile()) {}

  private connection(): { url: string; token: string } {
    try {
      const data = JSON.parse(readFileSync(this.connectionFile, 'utf8')) as { url?: string; token?: string }
      if (data.url && data.token) return { url: data.url, token: data.token }
    } catch {
      // Нет файла — Recallo закрыт или API выключен.
    }
    throw new RecalloUnavailableError(NOT_RUNNING)
  }

  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const { url, token } = this.connection()
    let res: Response
    try {
      res = await fetch(`${url}/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          // Каждый вызов инструмента — один ключ: сетевой повтор не создаст дубль (API-14).
          ...(method !== 'GET' ? { 'Idempotency-Key': randomUUID() } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    } catch {
      throw new RecalloUnavailableError(NOT_RUNNING)
    }
    const text = await res.text()
    const data = text ? (JSON.parse(text) as unknown) : undefined
    if (!res.ok) {
      const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
      throw new RecalloApiError(res.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `HTTP ${res.status}`, error?.details)
    }
    return data as T
  }
}
