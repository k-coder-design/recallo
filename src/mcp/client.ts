import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where Recallo leaves the API address and token while the Agent API is on. */
export function defaultConnectionFile(): string {
  return process.env['RECALLO_CONNECTION_FILE'] ?? join(homedir(), 'Library/Application Support/Recallo/agent-api.json')
}

export class RecalloUnavailableError extends Error {}

/** A Recallo API error with the code from the response body (API-12). */
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
 * A client of the local Recallo API. The connection file is re-read on every call:
 * a port or token change in Settings is picked up without restarting the agent.
 */
export class RecalloClient {
  constructor(private readonly connectionFile = defaultConnectionFile()) {}

  private connection(): { url: string; token: string } {
    try {
      const data = JSON.parse(readFileSync(this.connectionFile, 'utf8')) as { url?: string; token?: string }
      if (data.url && data.token) return { url: data.url, token: data.token }
    } catch {
      // No file — Recallo is closed or the API is off.
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
          // Each tool call is one key: a network retry will not create a duplicate (API-14).
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
