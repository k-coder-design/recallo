import { useState } from 'react'
import type { CardSet, SpaceId } from '../../../shared/types'
import { call, errorMessage } from '../lib/api'
import { Modal } from './Modal'

interface Props {
  spaceId: SpaceId
  set: CardSet | null
  onSaved: (set: CardSet) => void
  onClose: () => void
}

/** Creating and editing a set: a name and an optional description (SET-01, SET-03). */
export function SetEditor({ spaceId, set, onSaved, onClose }: Props) {
  const [name, setName] = useState(set?.name ?? '')
  const [description, setDescription] = useState(set?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = set
        ? await call('sets.update', set.id, { version: set.version, name, description })
        : await call('sets.create', { spaceId, name, description })
      onSaved(saved)
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={set ? 'Edit set' : 'New set'}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Movie" autoFocus />
        </label>
        <label className="field">
          <span>
            Description <small className="muted">— optional</small>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Words to describe films"
            rows={2}
          />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
