import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Db } from '../db/database'
import { toAppError } from '../domain/errors'

/** A route handler response. */
export interface RouteResult {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

export interface ApiRequest {
  method: string
  path: string
  params: Record<string, string>
  query: URLSearchParams
  headers: IncomingMessage['headers']
  body: unknown
}

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  /** Without a token only health and the API description are available. */
  public?: boolean
  handle: (req: ApiRequest) => RouteResult | Promise<RouteResult>
}

/** An HTTP error with a stable body structure (API-12). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_REVEALED: 409,
  PRESENTATION_EXPIRED: 409,
  INTERNAL: 500
}

const MAX_BODY_BYTES = 1024 * 1024
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const MUTATING = new Set(['POST', 'PATCH', 'DELETE'])

interface CompiledRoute extends Route {
  pattern: RegExp
  keys: string[]
}

function compile(route: Route): CompiledRoute {
  const keys: string[] = []
  const pattern = new RegExp(
    `^${route.path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key)
      return '([^/]+)'
    })}$`
  )
  return { ...route, pattern, keys }
}

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } }
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is larger than 1 MB')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Local HTTP API server: listens only on 127.0.0.1, checks Host (DNS rebinding protection),
 * requires a Bearer token (API-08), sends no CORS headers — browser pages cannot use it.
 * Changing requests with an Idempotency-Key header run at most once (API-14).
 */
export class LocalApiServer {
  private server: Server | null = null
  private readonly routes: CompiledRoute[]
  private port = 0

  constructor(
    routes: Route[],
    private readonly db: Db,
    private readonly getToken: () => string
  ) {
    this.routes = routes.map(compile)
  }

  get running(): boolean {
    return this.server !== null
  }

  async start(port: number): Promise<number> {
    await this.stop()
    const server = createServer((req, res) => void this.dispatch(req, res))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    const address = server.address()
    this.port = typeof address === 'object' && address ? address.port : port
    return this.port
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (!server) return
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    const payload = body === undefined ? '' : JSON.stringify(body)
    res.writeHead(status, {
      ...(payload ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    })
    res.end(payload)
  }

  private async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const host = req.headers.host ?? ''
      if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) {
        throw new HttpError(403, 'FORBIDDEN_HOST', 'Requests are accepted only for 127.0.0.1 or localhost')
      }

      const url = new URL(req.url ?? '/', `http://${host}`)
      const method = req.method ?? 'GET'
      let matched: { route: CompiledRoute; params: Record<string, string> } | null = null
      let pathExists = false
      for (const route of this.routes) {
        const m = route.pattern.exec(url.pathname)
        if (!m) continue
        pathExists = true
        if (route.method !== method) continue
        matched = {
          route,
          params: Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(m[i + 1] ?? '')]))
        }
        break
      }
      if (!matched) {
        throw pathExists
          ? new HttpError(405, 'METHOD_NOT_ALLOWED', `${method} is not supported for ${url.pathname}`)
          : new HttpError(404, 'NOT_FOUND', `No endpoint ${url.pathname}`)
      }

      if (!matched.route.public) {
        const auth = req.headers.authorization ?? ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
        if (!token || !sameSecret(token, this.getToken())) {
          throw new HttpError(401, 'UNAUTHORIZED', 'Missing or invalid token. Use "Authorization: Bearer <token>" from Recallo Settings.')
        }
      }

      const raw = MUTATING.has(method) ? await readBody(req) : ''
      let body: unknown = undefined
      if (raw.trim()) {
        if (!(req.headers['content-type'] ?? '').includes('application/json')) {
          throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON with "Content-Type: application/json"')
        }
        try {
          body = JSON.parse(raw)
        } catch {
          throw new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON')
        }
      }

      const key = MUTATING.has(method) ? String(req.headers['idempotency-key'] ?? '').trim() : ''
      if (key) {
        if (key.length > 200) throw new HttpError(400, 'VALIDATION', 'Idempotency-Key is too long (max 200)')
        const hash = createHash('sha256').update(`${method} ${url.pathname}${url.search}\n${raw}`).digest('hex')
        const stored = this.db.prepare('SELECT request_hash, status, response FROM idempotency_keys WHERE key = ?').get(key) as
          | { request_hash: string; status: number; response: string }
          | undefined
        if (stored) {
          if (stored.request_hash !== hash) {
            throw new HttpError(422, 'IDEMPOTENCY_MISMATCH', 'This Idempotency-Key was already used for a different request')
          }
          const replay = stored.response ? (JSON.parse(stored.response) as unknown) : undefined
          return this.send(res, stored.status, replay, { 'Idempotent-Replayed': 'true' })
        }
        const result = await this.run(matched.route, { method, path: url.pathname, params: matched.params, query: url.searchParams, headers: req.headers, body })
        // Server error responses are not remembered: such a request can safely be repeated.
        if (result.status < 500) {
          const now = Date.now()
          this.db.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').run(new Date(now - IDEMPOTENCY_TTL_MS).toISOString())
          this.db
            .prepare('INSERT INTO idempotency_keys (key, request_hash, status, response, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(key, hash, result.status, result.body === undefined ? '' : JSON.stringify(result.body), new Date(now).toISOString())
        }
        return this.send(res, result.status, result.body, result.headers)
      }

      const result = await this.run(matched.route, { method, path: url.pathname, params: matched.params, query: url.searchParams, headers: req.headers, body })
      this.send(res, result.status, result.body, result.headers)
    } catch (error) {
      if (error instanceof HttpError) return this.send(res, error.status, errorBody(error.code, error.message, error.details))
      const appError = toAppError(error)
      this.send(res, STATUS_BY_CODE[appError.code] ?? 500, errorBody(appError.code, appError.message, appError.details))
    }
  }

  /** Runs a route; domain errors become a response so they can be remembered by key. */
  private async run(route: Route, req: ApiRequest): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
    try {
      const result = await route.handle(req)
      return { status: result.status ?? 200, body: result.body, ...(result.headers ? { headers: result.headers } : {}) }
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: errorBody(error.code, error.message, error.details) }
      const appError = toAppError(error)
      return { status: STATUS_BY_CODE[appError.code] ?? 500, body: errorBody(appError.code, appError.message, appError.details) }
    }
  }
}
