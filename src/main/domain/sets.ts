import { randomUUID } from 'node:crypto'
import type { Db } from '../db/database'
import type { CardSet, SetDeletePolicy, SetScope, SpaceId } from '../../shared/types'
import { DomainError } from './errors'
import type { Clock } from './scheduler'
import { setCreateSchema, setDeletePolicySchema, setUpdateSchema, spaceIdSchema } from './validation'

interface SetRow {
  id: string
  space_id: SpaceId
  name: string
  description: string | null
  version: number
  created_at: string
  updated_at: string
  card_count: number
}

/** Условие SQL для области: все карточки, один набор или «без набора». Алиас таблицы карточек — `c`. */
export function scopeCondition(scope: SetScope): { sql: string; params: Record<string, string> } {
  if (scope.kind === 'set') return { sql: 'c.set_id = @scopeSetId', params: { scopeSetId: scope.setId } }
  if (scope.kind === 'none') return { sql: 'c.set_id IS NULL', params: {} }
  return { sql: '1 = 1', params: {} }
}

function toSet(row: SetRow): CardSet {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    description: row.description,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cardCount: row.card_count
  }
}

const SELECT_SETS = `
  SELECT s.*, (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count
  FROM sets s`

export class SetService {
  constructor(
    private readonly db: Db,
    private readonly now: Clock
  ) {}

  list(spaceId: SpaceId): CardSet[] {
    const id = spaceIdSchema.parse(spaceId)
    const rows = this.db
      .prepare(`${SELECT_SETS} WHERE s.space_id = ? ORDER BY s.name COLLATE NOCASE`)
      .all(id) as SetRow[]
    return rows.map(toSet)
  }

  /** Сколько карточек языка без набора (SET-05). */
  unsetCount(spaceId: SpaceId): number {
    return this.db
      .prepare('SELECT COUNT(*) FROM cards WHERE space_id = ? AND set_id IS NULL')
      .pluck()
      .get(spaceIdSchema.parse(spaceId)) as number
  }

  get(id: string): CardSet {
    const row = this.db.prepare(`${SELECT_SETS} WHERE s.id = ?`).get(id) as SetRow | undefined
    if (!row) throw new DomainError('NOT_FOUND', 'Set not found', { id })
    return toSet(row)
  }

  /** Набор существует и принадлежит этому языку — иначе карточку туда не положить (API-11). */
  requireInSpace(setId: string, spaceId: SpaceId): CardSet {
    const set = this.get(setId)
    if (set.spaceId !== spaceId) {
      throw new DomainError('VALIDATION', 'The set belongs to another language', { setId, spaceId })
    }
    return set
  }

  create(input: unknown): CardSet {
    const data = setCreateSchema.parse(input)
    this.assertNameFree(data.spaceId, data.name)
    const id = randomUUID()
    const timestamp = this.now().toISOString()
    this.db
      .prepare(
        `INSERT INTO sets (id, space_id, name, description, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(id, data.spaceId, data.name, data.description, timestamp, timestamp)
    return this.get(id)
  }

  update(id: string, input: unknown): CardSet {
    const data = setUpdateSchema.parse(input)
    this.db.transaction(() => {
      const current = this.get(id)
      if (current.version !== data.version) {
        throw new DomainError('CONFLICT', 'This set has been changed elsewhere. Reopen it and try again.', {
          currentVersion: current.version
        })
      }
      const name = data.name ?? current.name
      if (name.toLowerCase() !== current.name.toLowerCase()) this.assertNameFree(current.spaceId, name, id)
      this.db
        .prepare('UPDATE sets SET name = ?, description = ?, version = version + 1, updated_at = ? WHERE id = ?')
        .run(
          name,
          data.description !== undefined ? data.description : current.description,
          this.now().toISOString(),
          id
        )
    })()
    return this.get(id)
  }

  /**
   * Удаляет набор. keep-cards — карточки остаются «без набора» с прогрессом (SET-09);
   * delete-cards — удаляются вместе с прогрессом и историей. Возвращает число затронутых карточек.
   */
  delete(id: string, policy: unknown): { affectedCards: number } {
    const parsedPolicy: SetDeletePolicy = setDeletePolicySchema.parse(policy)
    return this.db.transaction(() => {
      const set = this.get(id)
      if (parsedPolicy === 'delete-cards') this.db.prepare('DELETE FROM cards WHERE set_id = ?').run(id)
      else this.db.prepare('UPDATE cards SET set_id = NULL WHERE set_id = ?').run(id)
      this.db.prepare('DELETE FROM sets WHERE id = ?').run(id)
      return { affectedCards: set.cardCount }
    })()
  }

  private assertNameFree(spaceId: SpaceId, name: string, exceptId?: string): void {
    const clash = this.db
      .prepare('SELECT id FROM sets WHERE space_id = ? AND name = ? COLLATE NOCASE AND id != ?')
      .get(spaceId, name, exceptId ?? '')
    if (clash) throw new DomainError('VALIDATION', `A set named “${name}” already exists`, { name })
  }
}
