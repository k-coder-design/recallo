import { useEffect, type ReactNode } from 'react'

export interface SheetAction {
  label: string
  onSelect: () => void
  danger?: boolean
}

interface Props {
  /** Заголовок над действиями, например слово карточки или имя набора. */
  title?: ReactNode
  actions: SheetAction[]
  onClose: () => void
  /** Дополнительное содержимое над списком действий (например, выбор набора). */
  children?: ReactNode
}

/**
 * Меню действий снизу экрана для телефона (W3): как системное меню iOS — список больших кнопок
 * и «Cancel». Выбор действия закрывает меню; закрыть можно касанием вне меню.
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
