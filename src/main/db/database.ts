import Database from 'better-sqlite3'
import { migrate } from './migrations'

export type { Db } from './types'
/** База приложения для Mac (better-sqlite3): ядру хватает Db, а резервной копии файла нужен весь API. */
export type NativeDb = Database.Database

/** Больше разных запросов в приложении нет; кэш с запасом, переполнение просто очищает его. */
const STATEMENT_CACHE_LIMIT = 300

/** Открывает (или создаёт) базу и применяет миграции. `:memory:` — для тестов. */
export function openDatabase(file: string): NativeDb {
  const db = new Database(file)
  if (file !== ':memory:') {
    db.pragma('journal_mode = WAL')
    // В режиме WAL NORMAL не рискует целостностью базы, а запись не ждёт fsync после каждой оценки.
    db.pragma('synchronous = NORMAL')
  }
  db.pragma('foreign_keys = ON')
  cacheStatements(db)
  migrate(db)
  return db
}

/**
 * Подготовленные запросы переиспользуются: сервисы вызывают prepare на каждый запрос,
 * а разбор SQL заново на каждой карточке — лишняя работа. Режим pluck/raw/expand,
 * включённый прошлым вызовом, сбрасывается, чтобы общий объект вёл себя как новый.
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
