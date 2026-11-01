/**
 * Подмножество API better-sqlite3, которым пользуется ядро (домен, миграции, API агента).
 * Его реализуют две базы: better-sqlite3 в приложении для Mac и SQLite WebAssembly
 * в телефонной сборке (`wasm.ts`, D57). Ядро зависит только от этого интерфейса.
 */
export interface RunResult {
  changes: number
}

export interface Statement {
  /** Первая строка результата или undefined; в режиме pluck — значение первого столбца. */
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): RunResult
  /** Вернуть только первый столбец (как в better-sqlite3); pluck(false) выключает режим. */
  pluck(toggle?: boolean): Statement
}

export interface Db {
  prepare(sql: string): Statement
  /** Функция, выполняющая fn в транзакции; вложенный вызов — точка сохранения (SAVEPOINT). */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
  pragma(source: string, options?: { simple?: boolean }): unknown
  exec(sql: string): unknown
}
