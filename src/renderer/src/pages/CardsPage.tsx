import { useCallback, useEffect, useMemo, useState } from 'react'
import { CARD_STATUS_LABELS, CARD_STATUSES, cardStatus, type CardStatus } from '../../../shared/cardStatus'
import type { Card, CardSet, SetScope, SpaceId } from '../../../shared/types'
import { ActionSheet } from '../components/ActionSheet'
import { DeleteSetDialog } from '../components/DeleteSetDialog'
import { ExportDialog } from '../components/ExportDialog'
import { ImportDialog } from '../components/ImportDialog'
import { Modal } from '../components/Modal'
import { SetEditor } from '../components/SetEditor'
import { call, errorMessage } from '../lib/api'
import { formatDue } from '../lib/format'
import { IS_PHONE } from '../lib/platform'
import { CardEditor } from './CardEditor'

interface Props {
  spaceId: SpaceId
  onChanged: () => void
}

const sameScope = (a: SetScope, b: SetScope) =>
  a.kind === b.kind && (a.kind !== 'set' || (b.kind === 'set' && a.setId === b.setId))

export function CardsPage({ spaceId, onChanged }: Props) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [sets, setSets] = useState<CardSet[]>([])
  const [unsetCount, setUnsetCount] = useState(0)
  const [scope, setScope] = useState<SetScope>({ kind: 'all' })
  const [search, setSearch] = useState('')
  /** Фильтр по статусу слова; null — все статусы. */
  const [status, setStatus] = useState<CardStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Card | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Card | null>(null)
  const [editingSet, setEditingSet] = useState<CardSet | 'new' | null>(null)
  const [deletingSet, setDeletingSet] = useState<CardSet | null>(null)
  const [transfer, setTransfer] = useState<'import' | 'export' | null>(null)
  /** Телефон (W3): меню действий страницы («⋯» у выбора набора) или карточки («⋯» в строке). */
  const [menu, setMenu] = useState<'page' | Card | null>(null)

  const currentSet = scope.kind === 'set' ? (sets.find((s) => s.id === scope.setId) ?? null) : null
  const total = sets.reduce((sum, s) => sum + s.cardCount, 0) + unsetCount

  const loadSets = useCallback(async () => {
    try {
      const [list, unset] = await Promise.all([call('sets.list', spaceId), call('sets.unsetCount', spaceId)])
      setSets(list)
      setUnsetCount(unset)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [spaceId])

  const loadCards = useCallback(async () => {
    try {
      setCards(await call('cards.list', spaceId, { scope, search }))
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [spaceId, scope, search])

  useEffect(() => {
    void loadSets()
  }, [loadSets])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCards(), search ? 200 : 0)
    return () => window.clearTimeout(timer)
  }, [loadCards, search])

  const afterChange = () => {
    void loadCards()
    void loadSets()
    onChanged()
  }

  const move = async (card: Card, setId: string | null) => {
    try {
      await call('cards.moveToSet', [card.id], setId)
      afterChange()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await call('cards.delete', deleting.id)
      setDeleting(null)
      afterChange()
    } catch (e) {
      setError(errorMessage(e))
      setDeleting(null)
    }
  }

  // Сколько карточек каждого статуса в текущей области и поиске — числа на кнопках фильтра.
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(CARD_STATUSES.map((s) => [s, 0])) as Record<CardStatus, number>
    for (const card of cards ?? []) counts[cardStatus(card.progress)]++
    return counts
  }, [cards])
  const shown = useMemo(
    () => (cards && status ? cards.filter((card) => cardStatus(card.progress) === status) : cards),
    [cards, status]
  )

  const setName = (setId: string | null) => sets.find((s) => s.id === setId)?.name ?? null
  const title = scope.kind === 'all' ? 'All cards' : scope.kind === 'none' ? 'No set' : (currentSet?.name ?? 'Set')

  return (
    <section className="page cards-page">
      {IS_PHONE && (
        <div className="phone-scope">
          <select
            className="scope-select"
            aria-label="Set"
            value={scope.kind === 'set' ? `set:${scope.setId}` : scope.kind}
            onChange={(e) => {
              const value = e.target.value
              if (value === '__new') setEditingSet('new')
              else setScope(value === 'all' ? { kind: 'all' } : value === 'none' ? { kind: 'none' } : { kind: 'set', setId: value.slice(4) })
            }}
          >
            <option value="all">All cards ({total})</option>
            <option value="none">No set ({unsetCount})</option>
            {sets.length > 0 && (
              <optgroup label="Sets">
                {sets.map((set) => (
                  <option key={set.id} value={`set:${set.id}`}>
                    {set.name} ({set.cardCount})
                  </option>
                ))}
              </optgroup>
            )}
            <option value="__new">+ New set…</option>
          </select>
          <button type="button" className="icon-circle" onClick={() => setMenu('page')} aria-label="Set and file actions">
            ⋯
          </button>
        </div>
      )}

      {!IS_PHONE && (
        <aside className="sets-sidebar" aria-label="Sets">
          <ScopeItem label="All cards" count={total} active={scope.kind === 'all'} onClick={() => setScope({ kind: 'all' })} />
          <ScopeItem label="No set" count={unsetCount} active={scope.kind === 'none'} onClick={() => setScope({ kind: 'none' })} />
          <h3 className="section-label sidebar-label">Sets</h3>
          {sets.map((set) => (
            <ScopeItem
              key={set.id}
              label={set.name}
              count={set.cardCount}
              active={sameScope(scope, { kind: 'set', setId: set.id })}
              onClick={() => setScope({ kind: 'set', setId: set.id })}
            />
          ))}
          {sets.length === 0 && <p className="muted small">No sets yet.</p>}
          <button type="button" className="button ghost sidebar-new" onClick={() => setEditingSet('new')}>
            + New set
          </button>
        </aside>
      )}

      <div className="cards-main">
        {IS_PHONE ? (
          currentSet?.description && <p className="muted set-description">{currentSet.description}</p>
        ) : (
          <div className="page-header">
            <div className="cards-title">
              <h1>{title}</h1>
              {currentSet?.description && <p className="muted set-description">{currentSet.description}</p>}
            </div>
            <div className="row cards-actions">
              {currentSet && (
                <>
                  <button type="button" className="button" onClick={() => setEditingSet(currentSet)}>
                    Edit set
                  </button>
                  <button type="button" className="button" onClick={() => setDeletingSet(currentSet)}>
                    Delete set
                  </button>
                </>
              )}
              <button type="button" className="button" onClick={() => setTransfer('import')}>
                Import
              </button>
              <button type="button" className="button" onClick={() => setTransfer('export')}>
                Export
              </button>
              <button type="button" className="button primary" onClick={() => setEditing('new')}>
                + New card
              </button>
            </div>
          </div>
        )}

        <input
          className="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search words, meanings, examples and sets…"
          aria-label="Search cards"
        />

        <div className="status-filter" role="radiogroup" aria-label="Filter by status">
          <button
            type="button"
            role="radio"
            aria-checked={status === null}
            className={status === null ? 'active' : ''}
            onClick={() => setStatus(null)}
          >
            All <span className="status-filter-count">{cards?.length ?? 0}</span>
          </button>
          {CARD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              className={`status-${s}${status === s ? ' active' : ''}`}
              onClick={() => setStatus(status === s ? null : s)}
              disabled={statusCounts[s] === 0 && status !== s}
            >
              {CARD_STATUS_LABELS[s]} <span className="status-filter-count">{statusCounts[s]}</span>
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {shown === null ? (
          <p className="muted">Loading…</p>
        ) : shown.length === 0 ? (
          <div className="empty">
            {status && cards && cards.length > 0 ? (
              <p>
                No {CARD_STATUS_LABELS[status].toLowerCase()} cards here.{' '}
                <button type="button" className="link-button" onClick={() => setStatus(null)}>
                  Show all
                </button>
              </p>
            ) : search ? (
              <p>Nothing found for “{search}”.</p>
            ) : (
              <>
                <p>No cards here yet.</p>
                <p className="muted">
                  {scope.kind === 'set'
                    ? 'Add a new card to this set, or move cards here from “All cards”.'
                    : 'Add your first word or phrase to start learning.'}
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="card-list">
            {shown.map((card) =>
              IS_PHONE ? (
                <li key={card.id} className="card-row">
                  <button type="button" className="card-row-main" onClick={() => setEditing(card)}>
                    <span className="term">
                      {card.emoji && <span className="list-emoji">{card.emoji}</span>}
                      {card.term}
                    </span>
                    <span className="meaning">{card.meaning}</span>
                  </button>
                  <span className="card-row-meta">
                    <span className={`status status-${cardStatus(card.progress)}`}>
                      {CARD_STATUS_LABELS[cardStatus(card.progress)]}
                    </span>
                    {card.progress.state !== 'new' && <span className="due muted small">{formatDue(card.progress.due)}</span>}
                  </span>
                  <button type="button" className="icon-circle row-menu" onClick={() => setMenu(card)} aria-label={`Actions for ${card.term}`}>
                    ⋯
                  </button>
                </li>
              ) : (
                <li key={card.id} className="card-row">
                  <button type="button" className="card-row-main" onClick={() => setEditing(card)}>
                    <span className="term">
                      {card.emoji && <span className="list-emoji">{card.emoji}</span>}
                      {card.term}
                    </span>
                    <span className="meaning">{card.meaning}</span>
                  </button>
                  <span className={`status status-${cardStatus(card.progress)}`}>
                    {CARD_STATUS_LABELS[cardStatus(card.progress)]}
                  </span>
                  <span className="due muted small">
                    {card.progress.state === 'new' ? '—' : formatDue(card.progress.due)}
                  </span>
                  <select
                    className="move-select"
                    value={card.setId ?? ''}
                    onChange={(e) => void move(card, e.target.value || null)}
                    aria-label={`Set of ${card.term}`}
                    title={setName(card.setId) ?? 'No set'}
                  >
                    <option value="">No set</option>
                    {sets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="link-button danger" onClick={() => setDeleting(card)}>
                    Delete
                  </button>
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {IS_PHONE && (
        <button type="button" className="fab" onClick={() => setEditing('new')} aria-label="New card">
          +
        </button>
      )}

      {menu === 'page' && (
        <ActionSheet
          title={title}
          onClose={() => setMenu(null)}
          actions={[
            ...(currentSet
              ? [
                  { label: 'Edit set', onSelect: () => setEditingSet(currentSet) },
                  { label: 'Delete set', onSelect: () => setDeletingSet(currentSet), danger: true }
                ]
              : []),
            { label: 'New set', onSelect: () => setEditingSet('new') },
            { label: 'Import cards', onSelect: () => setTransfer('import') },
            { label: 'Export cards', onSelect: () => setTransfer('export') }
          ]}
        />
      )}

      {menu && menu !== 'page' && (
        <ActionSheet
          title={
            <>
              {menu.emoji && <span className="list-emoji">{menu.emoji}</span>}
              {menu.term}
            </>
          }
          onClose={() => setMenu(null)}
          actions={[
            { label: 'Edit card', onSelect: () => setEditing(menu) },
            { label: 'Delete card', onSelect: () => setDeleting(menu), danger: true }
          ]}
        >
          <label className="sheet-field">
            <span>Set</span>
            <select
              value={menu.setId ?? ''}
              onChange={(e) => {
                void move(menu, e.target.value || null)
                setMenu(null)
              }}
            >
              <option value="">No set</option>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
        </ActionSheet>
      )}

      {editing && (
        <CardEditor
          spaceId={spaceId}
          card={editing === 'new' ? null : editing}
          defaultSetId={scope.kind === 'set' ? scope.setId : null}
          onClose={() => setEditing(null)}
          onOpenCard={async (cardId) => {
            try {
              setEditing(await call('cards.get', cardId))
            } catch (e) {
              setError(errorMessage(e))
            }
          }}
          onSaved={() => {
            setEditing(null)
            afterChange()
          }}
        />
      )}

      {deleting && (
        <Modal
          title="Delete this card?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="button" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className="button danger" onClick={confirmDelete}>
                Delete
              </button>
            </>
          }
        >
          <p>
            “{deleting.term}” will be deleted together with its progress and review history. This cannot be
            undone.
          </p>
        </Modal>
      )}

      {editingSet && (
        <SetEditor
          spaceId={spaceId}
          set={editingSet === 'new' ? null : editingSet}
          onClose={() => setEditingSet(null)}
          onSaved={(saved) => {
            setEditingSet(null)
            setScope({ kind: 'set', setId: saved.id })
            afterChange()
          }}
        />
      )}

      {transfer === 'import' && (
        <ImportDialog
          spaceId={spaceId}
          sets={sets}
          currentSetId={scope.kind === 'set' ? scope.setId : null}
          onImported={afterChange}
          onClose={() => setTransfer(null)}
        />
      )}

      {transfer === 'export' && <ExportDialog spaceId={spaceId} sets={sets} scope={scope} onClose={() => setTransfer(null)} />}

      {deletingSet && (
        <DeleteSetDialog
          set={deletingSet}
          onClose={() => setDeletingSet(null)}
          onDeleted={(policy) => {
            setDeletingSet(null)
            setScope(policy === 'keep-cards' ? { kind: 'none' } : { kind: 'all' })
            afterChange()
          }}
        />
      )}
    </section>
  )
}

function ScopeItem({
  label,
  count,
  active,
  onClick
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`scope-item ${active ? 'active' : ''}`} onClick={onClick} aria-current={active}>
      <span className="scope-name">{label}</span>
      <span className="scope-count">{count}</span>
    </button>
  )
}
