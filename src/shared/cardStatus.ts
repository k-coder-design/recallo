import type { CardProgress } from './types'

/** Статус карточки в списке Cards: состояние FSRS, а новая карточка после знакомства — отдельно (D21). */
export type CardStatus = 'new' | 'introduced' | 'learning' | 'review' | 'relearning'

/** Порядок — путь слова: новое → знакомое → изучается → на повторении (и снова, если забыто). */
export const CARD_STATUSES: readonly CardStatus[] = ['new', 'introduced', 'learning', 'review', 'relearning']

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  new: 'New',
  introduced: 'Introduced',
  learning: 'Learning',
  review: 'Review',
  relearning: 'Relearning'
}

export function cardStatus(progress: CardProgress): CardStatus {
  return progress.state === 'new' && progress.introducedAt ? 'introduced' : progress.state
}
