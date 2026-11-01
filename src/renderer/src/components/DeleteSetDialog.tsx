import { useState } from 'react'
import type { CardSet, SetDeletePolicy } from '../../../shared/types'
import { call, errorMessage } from '../lib/api'
import { plural } from '../lib/format'
import { Modal } from './Modal'

interface Props {
  set: CardSet
  onDeleted: (policy: SetDeletePolicy) => void
  onClose: () => void
}

/**
 * Удаление набора — всегда с явным выбором (SET-08…10): оставить карточки без набора,
 * удалить их вместе с набором (после второго подтверждения с количеством) или отменить.
 */
export function DeleteSetDialog({ set, onDeleted, onClose }: Props) {
  const [confirmingCards, setConfirmingCards] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = `${set.cardCount} ${plural(set.cardCount, 'card', 'cards')}`

  const remove = async (policy: SetDeletePolicy) => {
    setBusy(true)
    setError(null)
    try {
      await call('sets.delete', set.id, policy)
      onDeleted(policy)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  if (confirmingCards) {
    return (
      <Modal
        title={`Delete ${count} permanently?`}
        onClose={onClose}
        footer={
          <>
            {error && <p className="error grow">{error}</p>}
            <button type="button" className="button" onClick={() => setConfirmingCards(false)} disabled={busy}>
              Back
            </button>
            <button type="button" className="button danger" onClick={() => void remove('delete-cards')} disabled={busy}>
              Delete set and {count}
            </button>
          </>
        }
      >
        <p>
          The set “{set.name}” and its {count} will be deleted together with their progress and review history. This
          cannot be undone.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title={`Delete “${set.name}”?`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button danger-outline"
            onClick={() => (set.cardCount > 0 ? setConfirmingCards(true) : void remove('delete-cards'))}
            disabled={busy}
          >
            Delete with cards
          </button>
          <button type="button" className="button primary" onClick={() => void remove('keep-cards')} disabled={busy}>
            Keep cards
          </button>
        </>
      }
    >
      <p>
        {set.cardCount === 0
          ? 'This set is empty.'
          : `What should happen to its ${count}? “Keep cards” moves them to “No set” with all their progress.`}
      </p>
    </Modal>
  )
}
