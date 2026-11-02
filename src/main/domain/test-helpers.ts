import type { Db } from '../db/database'
import { openTestDatabase } from '../db/testDatabase'
import { createServices, type Services } from '../services'
import type { Card, CardCreateInput, Grade, GradeResult, NextCard, SpaceId } from '../../shared/types'
import { INTRO_TO_RECALL_DELAY_MS } from './study'

export const MINUTE = 60_000

type ShownCard = Extract<NextCard, { kind: 'card' }>

export interface TestContext extends Services {
  db: Db
  now: () => Date
  advance: (ms: number) => void
  addCard: (input?: Partial<CardCreateInput>) => Card
  /** Shows the next card, reveals it and grades it. */
  answer: (grade: Grade, options?: { spaceId?: SpaceId; avoidCardId?: string }) => { shown: ShownCard; result: GradeResult }
  /** Goes through the meeting of all new cards and waits until they are ready for recall. */
  introduceAll: (spaceId?: SpaceId) => void
}

export function setup(): TestContext {
  let time = new Date('2026-10-23T10:00:00.000Z').getTime()
  const db = openTestDatabase()
  const services = createServices(db, { now: () => new Date(time), scheduler: { fuzz: false } })

  const answer: TestContext['answer'] = (grade, options = {}) => {
    const shown = expectCard(services.study.next(options.spaceId ?? 'en', { avoidCardId: options.avoidCardId }))
    services.study.reveal(shown.presentationId)
    return { shown, result: services.study.grade(shown.presentationId, grade) }
  }

  return {
    db,
    ...services,
    now: () => new Date(time),
    advance(ms) {
      time += ms
    },
    addCard(input = {}) {
      return services.cards.create({ spaceId: 'en', term: 'run', meaning: 'to run', ...input })
    },
    answer,
    introduceAll(spaceId = 'en') {
      while (services.study.counts(spaceId).new > 0) {
        const { shown } = answer('remembered', { spaceId })
        if (shown.mode !== 'intro') throw new Error('Expected a meeting')
      }
      time += INTRO_TO_RECALL_DELAY_MS
    }
  }
}

export function expectCard(next: NextCard): ShownCard {
  if (next.kind !== 'card') throw new Error(`Expected a card, got: ${next.kind}`)
  return next
}

export function expectRecall(next: NextCard): Extract<NextCard, { mode: 'recall' }> {
  const card = expectCard(next)
  if (card.mode !== 'recall') throw new Error('Expected a recall, got a meeting')
  return card
}

export function expectIntro(next: NextCard): Extract<NextCard, { mode: 'intro' }> {
  const card = expectCard(next)
  if (card.mode !== 'intro') throw new Error('Expected a meeting, got a recall')
  return card
}
