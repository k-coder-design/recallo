import type { Database as WasmDatabase, PreparedStatement, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { migrate } from './migrations'
import type { Db, RunResult, Statement } from './types'

/** As in better-sqlite3: the app has few distinct queries; overflow simply clears the cache. */
const STATEMENT_CACHE_LIMIT = 300

/**
 * A SQLite WebAssembly database behind the Db interface — for the phone build (D57) and for running
 * the domain tests on a second database. It mirrors better-sqlite3 where the core relies on it:
 * named parameters without a prefix (`{ spaceId }` for `@spaceId`), get/all/run/pluck,
 * transactions with SAVEPOINT for nested calls, pragma with { simple }.
 */
export function wrapWasmDatabase(sqlite3: Sqlite3Static, raw: WasmDatabase): Db {
  const cache = new Map<string, WasmStatement>()
  let depth = 0

  const db: Db = {
    prepare(sql) {
      let statement = cache.get(sql)
      if (!statement) {
        if (cache.size >= STATEMENT_CACHE_LIMIT) {
          for (const cached of cache.values()) cached.finalize()
          cache.clear()
        }
        statement = new WasmStatement(sqlite3, raw, raw.prepare(sql))
        cache.set(sql, statement)
      } else {
        statement.pluck(false)
      }
      return statement
    },

    transaction(fn) {
      return (...args) => {
        const savepoint = `recallo_${depth}`
        raw.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${savepoint}`)
        depth++
        try {
          const result = fn(...args)
          depth--
          raw.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`)
          return result
        } catch (error) {
          depth--
          raw.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`)
          throw error
        }
      }
    },

    pragma(source, options = {}) {
      const rows = raw.exec(`PRAGMA ${source}`, { rowMode: 'object', returnValue: 'resultRows' })
      if (!options.simple) return rows
      const first = rows[0]
      return first === undefined ? undefined : Object.values(first)[0]
    },

    exec(sql) {
      raw.exec(sql)
      return db
    }
  }
  return db
}

/** Opens a WebAssembly database (in memory or a VFS file) and applies the same migrations as on the Mac. */
export function openWasmDatabase(sqlite3: Sqlite3Static, open: () => WasmDatabase = () => new sqlite3.oo1.DB(':memory:')): Db {
  const db = wrapWasmDatabase(sqlite3, open())
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

class WasmStatement implements Statement {
  private plucking = false
  /** Each parameter name in order (without the @ : $ prefix), or null for "?". */
  private readonly names: Array<string | null>

  constructor(
    sqlite3: Sqlite3Static,
    private readonly raw: WasmDatabase,
    private readonly stmt: PreparedStatement
  ) {
    this.names = Array.from({ length: stmt.parameterCount }, (_, i) => {
      const name = sqlite3.capi.sqlite3_bind_parameter_name(stmt, i + 1)
      return name ? name.slice(1) : null
    })
  }

  pluck(toggle = true): Statement {
    this.plucking = toggle
    return this
  }

  get(...params: unknown[]): unknown {
    return this.query(params, (rows) => rows[0])
  }

  all(...params: unknown[]): unknown[] {
    return this.query(params, (rows) => rows)
  }

  run(...params: unknown[]): RunResult {
    this.bind(params)
    try {
      this.stmt.step()
    } finally {
      this.stmt.reset(true)
    }
    return { changes: this.raw.changes() }
  }

  finalize(): void {
    this.stmt.finalize()
  }

  private query<T>(params: unknown[], pick: (rows: unknown[]) => T): T {
    this.bind(params)
    const rows: unknown[] = []
    try {
      while (this.stmt.step()) {
        rows.push(this.plucking ? this.stmt.get(0) : this.stmt.get({}))
      }
    } finally {
      this.stmt.reset(true)
    }
    return pick(rows)
  }

  /**
   * Parameters as in better-sqlite3: positional values in "?" order, named ones —
   * from an object, keys without a prefix. A missing named parameter is an error, as there.
   */
  private bind(params: unknown[]): void {
    if (this.names.length === 0) return
    const named = params.find(isPlainObject)
    const positional = params.filter((p) => !isPlainObject(p)).flat()
    let next = 0
    const values = this.names.map((name) => {
      if (name === null) return toSql(positional[next++])
      if (!named || !(name in named)) throw new RangeError(`Missing named parameter "${name}"`)
      return toSql(named[name])
    })
    this.stmt.bind(values)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value)
}

/** better-sqlite3 rejects undefined and booleans; the core does not pass them, but null stays null. */
function toSql(value: unknown): string | number | bigint | null | Uint8Array {
  if (value === undefined) throw new RangeError('Too few parameter values were provided')
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
  if (value instanceof Uint8Array) return value
  throw new TypeError(`SQLite can only bind numbers, strings, bigints, buffers, and null`)
}
