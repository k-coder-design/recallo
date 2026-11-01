import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { openDatabase } from './database'
import type { Db } from './types'
import { openWasmDatabase } from './wasm'

/**
 * База для тестов ядра. Обычно — better-sqlite3, как в приложении для Mac; при RECALLO_DB=wasm —
 * SQLite WebAssembly, как в телефонной сборке (D57). Так одни и те же тесты проверяют обе базы.
 */
let sqlite3: Sqlite3Static | undefined

export const testEngine = process.env['RECALLO_DB'] === 'wasm' ? 'wasm' : 'native'

/** Загрузка WebAssembly асинхронная — её делает setupFiles до тестов (vitest.config.ts). */
export async function initTestDatabase(): Promise<void> {
  if (testEngine === 'wasm') sqlite3 ??= await sqlite3InitModule()
}

export function openTestDatabase(): Db {
  if (testEngine === 'native') return openDatabase(':memory:')
  if (!sqlite3) throw new Error('SQLite WebAssembly is not loaded: run initTestDatabase() first')
  return openWasmDatabase(sqlite3)
}
