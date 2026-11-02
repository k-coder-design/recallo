import { describe, expect, it } from 'vitest'
import { openDatabase } from './database'

describe('openDatabase: prepared statement cache', () => {
  it('returns the same statement, resetting the pluck mode of the previous call', () => {
    const db = openDatabase(':memory:')
    const sql = 'SELECT id, name FROM spaces ORDER BY position'
    const first = db.prepare(sql)
    expect(first.pluck().get()).toBe('en')
    const second = db.prepare(sql)
    expect(second).toBe(first)
    expect(second.get()).toEqual({ id: 'en', name: 'English' })
  })

  it('caches statements without a result too', () => {
    const db = openDatabase(':memory:')
    const sql = 'UPDATE spaces SET name = ? WHERE id = ?'
    expect(db.prepare(sql)).toBe(db.prepare(sql))
    db.prepare(sql).run('Inglés', 'en')
    expect(db.prepare('SELECT name FROM spaces WHERE id = ?').pluck().get('en')).toBe('Inglés')
  })
})
