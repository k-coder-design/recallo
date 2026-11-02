import Database from 'better-sqlite3'
import { migrate } from './migrations'

export type { Db } from './types'
/** The Mac app database (better-sqlite3): the core needs only Db, while backing up the file needs the full API. */
export type NativeDb = Database.Database

/** The app has no more distinct queries than this; the cache has room to spare, overflow simply clears it. */
const STATEMENT_CACHE_LIMIT = 300

/** Opens (or creates) the database and applies migrations. `:memory:` — for tests. */
export function openDatabase(file: string): NativeDb {
  const db = new Database(file)
  if (file !== ':memory:') {
    db.pragma('journal_mode = WAL')
    // In WAL mode NORMAL does not risk database integrity, and a write does not wait for fsync after every grade.
    db.pragma('synchronous = NORMAL')
  }
  db.pragma('foreign_keys = ON')
  cacheStatements(db)
  migrate(db)
  return db
}

/**
 * Prepared statements are reused: services call prepare for every query,
 * and parsing SQL again for every card is wasted work. A pluck/raw/expand mode
 * turned on by a previous call is reset so the shared object behaves like a new one.
 */
function cacheStatements(db: NativeDb): void {
  const prepare = db.prepare.bind(db)
  const cache = new Map<string, Database.Statement>()
  db.prepare = ((sql: string) => {
    let statement = cache.get(sql)
    if (!statement) {
      if (cache.size >= STATEMENT_CACHE_LIMIT) cache.clear()
      statement = prepare(sql)
      cache.set(sql, statement)
    } else if (statement.reader) {
      statement.pluck(false).expand(false).raw(false)
    }
    return statement
  }) as NativeDb['prepare']
}
