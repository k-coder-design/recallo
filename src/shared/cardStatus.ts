import type { CardProgress } from './types'

/** A card's status in the Cards list: the FSRS state, with a new card after its meeting shown separately (D21). */
export type CardStatus = 'new' | 'introduced' | 'learning' | 'review' | 'relearning'

/** The order is the word's path: new → introduced → learning → review (and again, if forgotten). */
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
