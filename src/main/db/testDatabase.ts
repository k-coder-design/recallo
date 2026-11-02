import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { openDatabase } from './database'
import type { Db } from './types'
import { openWasmDatabase } from './wasm'

/**
 * The database for core tests. Normally better-sqlite3, as in the Mac app; with RECALLO_DB=wasm —
 * SQLite WebAssembly, as in the phone build (D57). So the same tests check both databases.
 */
let sqlite3: Sqlite3Static | undefined

export const testEngine = process.env['RECALLO_DB'] === 'wasm' ? 'wasm' : 'native'

/** Loading WebAssembly is asynchronous — setupFiles does it before the tests (vitest.config.ts). */
export async function initTestDatabase(): Promise<void> {
  if (testEngine === 'wasm') sqlite3 ??= await sqlite3InitModule()
}

export function openTestDatabase(): Db {
  if (testEngine === 'native') return openDatabase(':memory:')
  if (!sqlite3) throw new Error('SQLite WebAssembly is not loaded: run initTestDatabase() first')
  return openWasmDatabase(sqlite3)
}
