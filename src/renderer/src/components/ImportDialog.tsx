import { useEffect, useState } from 'react'
import type {
  CardSet,
  ImportDestination,
  ImportFormat,
  ImportPreview,
  ImportResult,
  OpenedFile,
  SpaceId
} from '../../../shared/types'
import { call, errorMessage } from '../lib/api'
import { plural } from '../lib/format'
import { Modal } from './Modal'

interface Props {
  spaceId: SpaceId
  sets: CardSet[]
  /** The set open in Cards right now — the default destination. */
  currentSetId: string | null
  onImported: () => void
  onClose: () => void
}

const FORMAT_LABELS: Record<ImportFormat, string> = {
  'recallo-json': 'Recallo JSON',
  'recallo-csv': 'Recallo CSV',
  duocards: 'DuoCards export (CSV)',
  quizlet: 'Quizlet / two columns (term ⇥ definition)'
}

const STATUS_LABELS = { new: 'New', duplicate: 'Duplicate', error: 'Error', created: 'Added', skipped: 'Skipped' } as const

type DestinationKey = 'file-sets' | 'new-set' | 'none' | `set:${string}`

/** Card import: file → preview with duplicates and errors → import with a report (MVP-4). */
export function ImportDialog({ spaceId, sets, currentSetId, onImported, onClose }: Props) {
  const [file, setFile] = useState<OpenedFile | null>(null)
  const [format, setFormat] = useState<ImportFormat | undefined>(undefined)
  const [swap, setSwap] = useState(false)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [destinationKey, setDestinationKey] = useState<DestinationKey>(currentSetId ? `set:${currentSetId}` : 'new-set')
  const [newSetName, setNewSetName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const destination = (): ImportDestination =>
    destinationKey === 'file-sets'
      ? { kind: 'file-sets' }
      : destinationKey === 'none'
        ? { kind: 'none' }
        : destinationKey === 'new-set'
          ? { kind: 'new-set', name: newSetName }
          : { kind: 'set', setId: destinationKey.slice(4) }

  const choose = async () => {
    setError(null)
    try {
      const opened = await call('transfer.openFile', 'import')
      if (!opened) return
      setFile(opened)
      setFormat(undefined)
      setNewSetName(opened.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // The preview is recalculated when the file, format, column swap or duplicate handling changes.
  useEffect(() => {
    if (!file) return
    let cancelled = false
    call('transfer.preview', file.content, { spaceId, ...(format ? { format } : {}), swap, includeDuplicates, destination: { kind: 'none' } })
      .then((next) => {
        if (cancelled) return
        setPreview(next)
        setError(null)
        if (!format) setFormat(next.format)
        if (next.hasSets && !currentSetId) setDestinationKey('file-sets')
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPreview(null)
          setError(errorMessage(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [file, format, swap, includeDuplicates, spaceId, currentSetId])

  const runImport = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const done = await call('transfer.import', file.content, { spaceId, ...(format ? { format } : {}), swap, includeDuplicates, destination: destination() })
      setResult(done)
      onImported()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal
        title="Import complete"
        onClose={onClose}
        size="large"
        footer={
          <button type="button" className="button primary" onClick={onClose}>
            Done
          </button>
        }
      >
        <p className="import-result">
          Added <strong>{result.summary.created}</strong> {plural(result.summary.created, 'card', 'cards')}
          {result.summary.skipped > 0 && <> · skipped {result.summary.skipped} {plural(result.summary.skipped, 'duplicate', 'duplicates')}</>}
          {result.summary.errors > 0 && <> · {result.summary.errors} with errors</>}
        </p>
        <ImportTable rows={result.rows.filter((r) => r.status !== 'created')} empty="Everything was added." />
      </Modal>
    )
  }

  const toImport = preview ? preview.summary.new : 0
  return (
    <Modal
      title="Import cards"
      onClose={onClose}
      size="large"
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          {preview && (
            <button
              type="button"
              className="button primary"
              disabled={busy || toImport === 0 || (destinationKey === 'new-set' && !newSetName.trim())}
              onClick={() => void runImport()}
            >
              {busy ? 'Importing…' : `Import ${toImport} ${plural(toImport, 'card', 'cards')}`}
            </button>
          )}
        </>
      }
    >
      {!file ? (
        <div className="import-start">
          <p>Add words from a file. Supported:</p>
          <ul>
            <li>files exported from Recallo (CSV or JSON);</li>
            <li>DuoCards export (CSV with front, back, hint);</li>
            <li>Quizlet export or any two-column list: “term⇥definition” or “term, definition” per line.</li>
          </ul>
          <p className="muted small">You will see a preview first. Words you already have are skipped.</p>
          <button type="button" className="button primary" onClick={() => void choose()}>
            Choose file…
          </button>
        </div>
      ) : (
        <div className="form">
          <div className="import-file">
            <span>
              📄 <strong>{file.name}</strong>
            </span>
            <button type="button" className="link-button" onClick={() => void choose()}>
              Choose another file
            </button>
          </div>

          <div className="import-options">
            <label className="field">
              <span>Format</span>
              <select value={format ?? ''} onChange={(e) => setFormat(e.target.value as ImportFormat)}>
                {(Object.keys(FORMAT_LABELS) as ImportFormat[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Put cards into</span>
              <select value={destinationKey} onChange={(e) => setDestinationKey(e.target.value as DestinationKey)}>
                {preview?.hasSets && <option value="file-sets">Sets from the file</option>}
                <option value="new-set">New set…</option>
                {sets.map((s) => (
                  <option key={s.id} value={`set:${s.id}`}>
                    {s.name}
                  </option>
                ))}
                <option value="none">No set</option>
              </select>
            </label>
            {destinationKey === 'new-set' && (
              <label className="field">
                <span>New set name</span>
                <input value={newSetName} onChange={(e) => setNewSetName(e.target.value)} />
              </label>
            )}
          </div>

          <div className="row import-checks">
            <label className="checkbox-inline">
              <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} /> Swap word and meaning
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} /> Also add words I already
              have
            </label>
          </div>

          {preview && (
            <>
              <p className="import-summary">
                <span className="chip chip-new">{preview.summary.new} new</span>
                <span className="chip chip-duplicate">{preview.summary.duplicates} duplicates — skipped</span>
                {preview.summary.errors > 0 && <span className="chip chip-error">{preview.summary.errors} with errors</span>}
              </p>
              <ImportTable rows={preview.rows} empty="No cards in the file." />
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function ImportTable({ rows, empty }: { rows: ImportPreview['rows']; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>
  const shown = rows.slice(0, 300)
  return (
    <div className="import-table-wrap">
      <table className="import-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Word</th>
            <th>Meaning</th>
            <th>Set</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.index}>
              <td>
                <span className={`chip chip-${row.status}`} title={row.message}>
                  {STATUS_LABELS[row.status]}
                </span>
                {row.message && <div className="muted small">{row.message}</div>}
              </td>
              <td>{row.term || <span className="muted">—</span>}</td>
              <td className="muted">{row.meaning || '—'}</td>
              <td className="muted">{row.set ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && <p className="muted small">…and {rows.length - shown.length} more</p>}
    </div>
  )
}
