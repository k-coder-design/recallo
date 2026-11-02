/**
 * The subset of the better-sqlite3 API the core uses (domain, migrations, agent API).
 * Two databases implement it: better-sqlite3 in the Mac app and SQLite WebAssembly
 * in the phone build (`wasm.ts`, D57). The core depends only on this interface.
 */
export interface RunResult {
  changes: number
}

export interface Statement {
  /** The first result row or undefined; in pluck mode — the value of the first column. */
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): RunResult
  /** Return only the first column (as in better-sqlite3); pluck(false) turns the mode off. */
  pluck(toggle?: boolean): Statement
}

export interface Db {
  prepare(sql: string): Statement
  /** A function that runs fn in a transaction; a nested call is a savepoint (SAVEPOINT). */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
  pragma(source: string, options?: { simple?: boolean }): unknown
  exec(sql: string): unknown
}
