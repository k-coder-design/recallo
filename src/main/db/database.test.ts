import { describe, expect, it } from 'vitest'
import { openDatabase } from './database'

describe('openDatabase: кэш подготовленных запросов', () => {
  it('возвращает тот же запрос, сбрасывая режим pluck прошлого вызова', () => {
    const db = openDatabase(':memory:')
    const sql = 'SELECT id, name FROM spaces ORDER BY position'
    const first = db.prepare(sql)
    expect(first.pluck().get()).toBe('en')
    const second = db.prepare(sql)
    expect(second).toBe(first)
    expect(second.get()).toEqual({ id: 'en', name: 'English' })
  })

  it('кэширует и запросы без результата', () => {
    const db = openDatabase(':memory:')
    const sql = 'UPDATE spaces SET name = ? WHERE id = ?'
    expect(db.prepare(sql)).toBe(db.prepare(sql))
    db.prepare(sql).run('Inglés', 'en')
    expect(db.prepare('SELECT name FROM spaces WHERE id = ?').pluck().get('en')).toBe('Inglés')
  })
})
