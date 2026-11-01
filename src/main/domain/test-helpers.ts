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
  /** Показывает следующую карточку, раскрывает её и ставит оценку. */
  answer: (grade: Grade, options?: { spaceId?: SpaceId; avoidCardId?: string }) => { shown: ShownCard; result: GradeResult }
  /** Проходит знакомство со всеми новыми карточками и ждёт, пока они станут доступны для вспоминания. */
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
      return services.cards.create({ spaceId: 'en', term: 'run', meaning: 'бегать', ...input })
    },
    answer,
    introduceAll(spaceId = 'en') {
      while (services.study.counts(spaceId).new > 0) {
        const { shown } = answer('remembered', { spaceId })
        if (shown.mode !== 'intro') throw new Error('Ожидалось знакомство')
      }
      time += INTRO_TO_RECALL_DELAY_MS
    }
  }
}

export function expectCard(next: NextCard): ShownCard {
  if (next.kind !== 'card') throw new Error(`Ожидалась карточка, получено: ${next.kind}`)
  return next
}

export function expectRecall(next: NextCard): Extract<NextCard, { mode: 'recall' }> {
  const card = expectCard(next)
  if (card.mode !== 'recall') throw new Error('Ожидалось вспоминание, получено знакомство')
  return card
}

export function expectIntro(next: NextCard): Extract<NextCard, { mode: 'intro' }> {
  const card = expectCard(next)
  if (card.mode !== 'intro') throw new Error('Ожидалось знакомство, получено вспоминание')
  return card
}
