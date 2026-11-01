import { useState } from 'react'
import type { CardSet, ExportFormat, SetScope, SpaceId } from '../../../shared/types'
import { call, errorMessage } from '../lib/api'
import { Modal } from './Modal'

interface Props {
  spaceId: SpaceId
  sets: CardSet[]
  scope: SetScope
  onClose: () => void
}

const scopeKey = (scope: SetScope) => (scope.kind === 'set' ? `set:${scope.setId}` : scope.kind)
const scopeFromKey = (key: string): SetScope =>
  key.startsWith('set:') ? { kind: 'set', setId: key.slice(4) } : key === 'none' ? { kind: 'none' } : { kind: 'all' }

/** Экспорт словаря в CSV или JSON (без прогресса) — чтобы перенести, поделиться или открыть в таблице. */
export function ExportDialog({ spaceId, sets, scope: initialScope, onClose }: Props) {
  const [scope, setScope] = useState<SetScope>(initialScope)
  const [format, setFormat] = useState<ExportFormat>('csv')
  /** Куда сохранён файл; '' — сохранён, но путь неизвестен (телефон: меню «Поделиться»). */
  const [savedTo, setSavedTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await call('transfer.export', spaceId, scope, format)
      if (result.saved) setSavedTo(result.path ?? '')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Export cards"
      onClose={onClose}
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          <button type="button" className="button" onClick={onClose}>
            {savedTo !== null ? 'Done' : 'Cancel'}
          </button>
          {savedTo === null && (
            <button type="button" className="button primary" disabled={busy} onClick={() => void save()}>
              Export…
            </button>
          )}
        </>
      }
    >
      {savedTo !== null ? (
        <p>
          {savedTo ? (
            <>
              Saved to <code>{savedTo}</code>
            </>
          ) : (
            'Export file is ready.'
          )}
        </p>
      ) : (
        <div className="form">
          <label className="field">
            <span>Cards</span>
            <select value={scopeKey(scope)} onChange={(e) => setScope(scopeFromKey(e.target.value))}>
              <option value="all">All cards</option>
              {sets.map((s) => (
                <option key={s.id} value={`set:${s.id}`}>
                  {s.name} ({s.cardCount})
                </option>
              ))}
              <option value="none">No set</option>
            </select>
          </label>
          <fieldset className="radio-group">
            <legend>Format</legend>
            <label className="checkbox-inline">
              <input type="radio" name="format" checked={format === 'csv'} onChange={() => setFormat('csv')} /> CSV — opens in Excel or
              Numbers (up to 3 examples per card)
            </label>
            <label className="checkbox-inline">
              <input type="radio" name="format" checked={format === 'json'} onChange={() => setFormat('json')} /> JSON — everything, for moving
              to another Recallo
            </label>
          </fieldset>
          <p className="muted small">Only the words are exported, not your learning progress. For a full copy use Settings → Backup.</p>
        </div>
      )}
    </Modal>
  )
}
