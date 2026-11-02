import { useRef, type PointerEvent, type ReactNode } from 'react'

const THRESHOLD = 110

interface Props {
  /** Swiping is allowed only after the answer is revealed (LEARN-06). */
  swipeEnabled: boolean
  /** An extra class, e.g. the new-word frame or a flip phase. */
  className?: string | undefined
  labels?: { left: string; right: string }
  onSwipe: (direction: 'left' | 'right') => void
  onTap?: (() => void) | undefined
  children: ReactNode
}

export function SwipeCard({
  className,
  swipeEnabled,
  labels = { left: 'Forgot', right: 'Remembered' },
  onSwipe,
  onTap,
  children
}: Props) {
  const card = useRef<HTMLDivElement>(null)
  const leftLabel = useRef<HTMLDivElement>(null)
  const rightLabel = useRef<HTMLDivElement>(null)
  const start = useRef<number | null>(null)
  const moved = useRef(false)

  /** Dragging moves the card directly in the DOM: no re-render of the content on every pointer move. */
  const show = (offset: number) => {
    if (card.current) card.current.style.transform = offset ? `translateX(${offset}px) rotate(${offset / 25}deg)` : ''
    const progress = String(Math.min(Math.abs(offset) / THRESHOLD, 1))
    if (leftLabel.current) leftLabel.current.style.opacity = offset < 0 ? progress : '0'
    if (rightLabel.current) rightLabel.current.style.opacity = offset > 0 ? progress : '0'
  }

  const reset = () => {
    start.current = null
    card.current?.classList.remove('dragging')
    show(0)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea')) return
    start.current = event.clientX
    moved.current = false
    event.currentTarget.classList.add('dragging')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    const delta = event.clientX - start.current
    if (Math.abs(delta) > 5) moved.current = true
    if (swipeEnabled) show(delta)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    const delta = event.clientX - start.current
    if (swipeEnabled && Math.abs(delta) >= THRESHOLD) {
      // A swiped card stays where it was released: from there the leave animation takes it, not a return to center.
      start.current = null
      card.current?.classList.remove('dragging')
      onSwipe(delta > 0 ? 'right' : 'left')
      return
    }
    reset()
    if (!moved.current) onTap?.()
  }

  return (
    <div
      ref={card}
      className={`swipe-card ${className ?? ''} ${onTap && !swipeEnabled ? 'tappable' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
    >
      <div ref={rightLabel} className="swipe-label right" aria-hidden="true">
        {labels.right}
      </div>
      <div ref={leftLabel} className="swipe-label left" aria-hidden="true">
        {labels.left}
      </div>
      {children}
    </div>
  )
}
