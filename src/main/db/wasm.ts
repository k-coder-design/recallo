import type { Database as WasmDatabase, PreparedStatement, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { migrate } from './migrations'
import type { Db, RunResult, Statement } from './types'

/** Как в better-sqlite3: разных запросов в приложении немного, переполнение просто очищает кэш. */
const STATEMENT_CACHE_LIMIT = 300

/**
 * База SQLite WebAssembly за интерфейсом Db — для телефонной сборки (D57) и для прогона
 * тестов домена на второй базе. Повторяет поведение better-sqlite3 там, где на него опирается ядро:
 * именованные параметры без префикса (`{ spaceId }` для `@spaceId`), get/all/run/pluck,
 * транзакции с SAVEPOINT для вложенных вызовов, pragma с { simple }.
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

/** Открывает базу WebAssembly (в памяти или файл VFS) и применяет те же миграции, что на Mac. */
export function openWasmDatabase(sqlite3: Sqlite3Static, open: () => WasmDatabase = () => new sqlite3.oo1.DB(':memory:')): Db {
  const db = wrapWasmDatabase(sqlite3, open())
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

class WasmStatement implements Statement {
  private plucking = false
  /** Имя каждого параметра по порядку (без префикса @ : $) или null для «?». */
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
   * Параметры как в better-sqlite3: позиционные значения по порядку «?», именованные —
   * из объекта, ключи без префикса. Пропущенный именованный параметр — ошибка, как там.
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

/** better-sqlite3 отклоняет undefined и булевы значения; ядро их не передаёт, но null оставляем null. */
function toSql(value: unknown): string | number | bigint | null | Uint8Array {
  if (value === undefined) throw new RangeError('Too few parameter values were provided')
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
  if (value instanceof Uint8Array) return value
  throw new TypeError(`SQLite can only bind numbers, strings, bigints, buffers, and null`)
}
