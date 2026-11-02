import { useEffect, type ReactNode } from 'react'

export interface SheetAction {
  label: string
  onSelect: () => void
  danger?: boolean
}

interface Props {
  /** A title above the actions, e.g. the card word or the set name. */
  title?: ReactNode
  actions: SheetAction[]
  onClose: () => void
  /** Extra content above the action list (e.g. a set picker). */
  children?: ReactNode
}

/**
 * An action menu at the bottom of the screen for the phone (W3): like the iOS system menu — a list of large buttons
 * and "Cancel". Choosing an action closes the menu; tapping outside closes it too.
 */
export function ActionSheet({ title, actions, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="action-sheet" role="dialog" aria-modal="true">
        <div className="sheet-group">
          {title && <div className="sheet-title">{title}</div>}
          {children}
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`sheet-action${action.danger ? ' danger' : ''}`}
              onClick={() => {
                onClose()
                action.onSelect()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button type="button" className="sheet-action sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
