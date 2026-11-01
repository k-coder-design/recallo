import { describe, expect, it } from 'vitest'
import { openTestDatabase, testEngine } from './testDatabase'

// Файл входит только в проект «phone» (vitest.config.ts): база — SQLite WebAssembly.
describe('SQLite WebAssembly за интерфейсом Db (D57)', () => {
  it('тесты этого проекта действительно идут на WebAssembly', () => {
    expect(testEngine).toBe('wasm')
    // У базы better-sqlite3 есть backup(); у обёртки WebAssembly — только интерфейс Db.
    expect('backup' in openTestDatabase()).toBe(false)
  })

  it('миграции применены: схема та же, что на Mac', () => {
    const db = openTestDatabase()
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThan(0)
    expect(db.prepare('SELECT id FROM spaces ORDER BY position').pluck().all()).toEqual(['en', 'es'])
  })

  it('именованные параметры без префикса, позиционные — по порядку', () => {
    const db = openTestDatabase()
    expect(db.prepare('SELECT name FROM spaces WHERE id = @id').pluck().get({ id: 'es' })).toBe('Spanish')
    expect(db.prepare('SELECT name FROM spaces WHERE id = ? OR id = ? ORDER BY position').pluck().all('en', 'es')).toEqual([
      'English',
      'Spanish'
    ])
    expect(() => db.prepare('SELECT name FROM spaces WHERE id = @id').get({})).toThrow(/Missing named parameter "id"/)
  })

  it('кэш запросов сбрасывает pluck, run возвращает число изменений', () => {
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

  it('транзакция откатывается при ошибке, вложенная — только своя часть', () => {
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
        // Вложенная часть откатилась, внешняя продолжается.
      }
    })()
    expect(name()).toBe('Outer')
  })
})
