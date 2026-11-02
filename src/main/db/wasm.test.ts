import { describe, expect, it } from 'vitest'
import { openTestDatabase, testEngine } from './testDatabase'

// This file is only in the "phone" project (vitest.config.ts): the database is SQLite WebAssembly.
describe('SQLite WebAssembly behind the Db interface (D57)', () => {
  it('the tests of this project really run on WebAssembly', () => {
    expect(testEngine).toBe('wasm')
    // The better-sqlite3 database has backup(); the WebAssembly wrapper has only the Db interface.
    expect('backup' in openTestDatabase()).toBe(false)
  })

  it('migrations are applied: the schema is the same as on the Mac', () => {
    const db = openTestDatabase()
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThan(0)
    expect(db.prepare('SELECT id FROM spaces ORDER BY position').pluck().all()).toEqual(['en', 'es'])
  })

  it('named parameters without a prefix, positional ones in order', () => {
    const db = openTestDatabase()
    expect(db.prepare('SELECT name FROM spaces WHERE id = @id').pluck().get({ id: 'es' })).toBe('Spanish')
    expect(db.prepare('SELECT name FROM spaces WHERE id = ? OR id = ? ORDER BY position').pluck().all('en', 'es')).toEqual([
      'English',
      'Spanish'
    ])
    expect(() => db.prepare('SELECT name FROM spaces WHERE id = @id').get({})).toThrow(/Missing named parameter "id"/)
  })

  it('the statement cache resets pluck, run returns the number of changes', () => {
    const db = openTestDatabase()
    const sql = 'SELECT id, name FROM spaces ORDER BY position'
    const first = db.prepare(sql)
    expect(first.pluck().get()).toBe('en')
    const second = db.prepare(sql)
    expect(second).toBe(first)
    expect(second.get()).toEqual({ id: 'en', name: 'English' })
    expect(db.prepare('UPDATE spaces SET name = name').run().changes).toBe(2)
    expect(db.prepare('SELECT id FROM spaces WHERE id = ?').get('fr')).toBeUndefined()
  })

  it('a transaction rolls back on error, a nested one only its own part', () => {
    const db = openTestDatabase()
    const rename = db.prepare('UPDATE spaces SET name = ? WHERE id = ?')
    const name = () => db.prepare('SELECT name FROM spaces WHERE id = ?').pluck().get('en')

    expect(() =>
      db.transaction(() => {
        rename.run('Inglés', 'en')
        throw new Error('stop')
      })()
    ).toThrow('stop')
    expect(name()).toBe('English')

    db.transaction(() => {
      rename.run('Outer', 'en')
      try {
        db.transaction(() => {
          rename.run('Inner', 'en')
          throw new Error('inner')
        })()
      } catch {
        // The nested part rolled back, the outer one continues.
      }
    })()
    expect(name()).toBe('Outer')
  })
})
