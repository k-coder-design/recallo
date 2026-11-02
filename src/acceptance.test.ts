// Acceptance tests: the criteria from section 13 of the requirements (duocards_requirements.md).
// Voice criteria 6 and 8 were dropped together with MVP-5 (D45): the app has no spoken answers.
import { describe, expect, it } from 'vitest'
import { LocalApiServer } from './main/api/http'
import { createRoutes } from './main/api/routes'
import { SettingsService } from './main/domain/settings'
import { toAppError } from './main/domain/errors'
import { expectIntro, expectRecall, MINUTE, setup } from './main/domain/test-helpers'

describe('Section 13. Key acceptance criteria', () => {
  it('1. While studying the English space, Spanish cards do not appear', () => {
    const t = setup()
    t.addCard({ spaceId: 'es', term: 'correr', meaning: 'to run' })
    t.addCard({ spaceId: 'en', term: 'run', meaning: 'to run' })
    t.introduceAll('en')
    for (let i = 0; i < 5; i++) {
      const next = t.study.next('en', { allowEarly: true })
      if (next.kind !== 'card') break
      expect(t.cards.get(next.cardId).spaceId).toBe('en')
      t.study.reveal(next.presentationId)
      t.study.grade(next.presentationId, 'forgot')
    }
    expect(t.study.counts('en')).toMatchObject({ new: 0 })
    expect(t.study.counts('es')).toMatchObject({ new: 1 })
  })

  it('2. Before the flip the meaning and examples are visible, the expression is hidden in all examples', () => {
    const t = setup()
    t.addCard({
      term: 'am used to',
      meaning: 'to be accustomed to something',
      examples: [{ text: 'I am used to working remotely.' }, { text: "I'm used to it, I am used to noise.", maskFragments: ["'m used to"] }]
    })
    t.introduceAll()
    const front = expectRecall(t.study.next('en')).front
    expect(front.meaning).toBe('to be accustomed to something')
    expect(front.examples).toHaveLength(2)
    expect(JSON.stringify(front)).not.toMatch(/used to/i)
    expect(front.examples[1]?.filter((s) => s.masked)).toHaveLength(2)
  })

  it('3. After the flip the full answer, full examples and speech are available', () => {
    const t = setup()
    t.addCard({ term: 'dull', meaning: 'boring', examples: [{ text: 'The film is dull.' }] })
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    const back = t.study.reveal(shown.presentationId)
    expect(back.term).toBe('dull')
    expect(back.examples[0]?.segments.map((s) => s.text).join('')).toBe('The film is dull.')
    expect(back.ttsLang).toBe('en-US')
  })

  it('4. Deleting a set requires a choice: keep or delete the cards; cancel changes nothing', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    t.addCard({ term: 'dull', setId: set.id })
    // Without a chosen policy (as with Cancel — no request sent, or an empty one) nothing is deleted.
    expect(toAppError(captureError(() => t.sets.delete(set.id, undefined))).code).toBe('VALIDATION')
    expect(t.sets.get(set.id).cardCount).toBe(1)
    expect(t.sets.delete(set.id, 'delete-cards')).toEqual({ affectedCards: 1 })
    expect(t.cards.list('en')).toHaveLength(0)
  })

  it('5. Cards kept when a set is deleted are available without a set and keep their progress', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    const card = t.addCard({ term: 'dull', setId: set.id })
    t.introduceAll()
    t.answer('remembered')
    const progress = t.cards.get(card.id).progress
    t.sets.delete(set.id, 'keep-cards')
    expect(t.cards.list('en', { scope: { kind: 'none' } }).map((c) => c.id)).toEqual([card.id])
    expect(t.cards.get(card.id).progress).toEqual(progress)
  })

  it('7. A wrong answer returns the card to the queue; repeated mistakes do not drop it', () => {
    const t = setup()
    const card = t.addCard()
    t.introduceAll()
    for (let i = 0; i < 10; i++) {
      const { shown } = t.answer('forgot')
      expect(shown.cardId).toBe(card.id)
      t.advance(MINUTE)
    }
    expect(expectRecall(t.study.next('en')).cardId).toBe(card.id)
  })

  it('9. Manual study works without a microphone: a full cycle without voice features', () => {
    const t = setup()
    t.addCard()
    const intro = expectIntro(t.study.next('en'))
    t.study.reveal(intro.presentationId)
    expect(t.study.grade(intro.presentationId, 'remembered').mode).toBe('intro')
    t.advance(MINUTE)
    const recall = expectRecall(t.study.next('en'))
    t.study.reveal(recall.presentationId)
    expect(t.study.grade(recall.presentationId, 'remembered')).toMatchObject({ mode: 'recall', duplicate: false })
  })

  it('10. One card keeps a single progress when studying a set and all cards of the language', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    const card = t.addCard({ term: 'dull', setId: set.id })
    const scope = { kind: 'set' as const, setId: set.id }
    const intro = expectIntro(t.study.next('en', { scope }))
    t.study.reveal(intro.presentationId)
    t.study.grade(intro.presentationId, 'remembered')
    t.advance(MINUTE)
    // In the shared queue the card is already met and goes to recall.
    const recall = expectRecall(t.study.next('en'))
    expect(recall.cardId).toBe(card.id)
    t.study.reveal(recall.presentationId)
    t.study.grade(recall.presentationId, 'remembered')
    expect(t.cards.get(card.id).progress.reps).toBe(1)
    expect(t.study.counts('en', scope)).toEqual(t.study.counts('en'))
  })

  it('11. An authorized agent edits sets and cards through the documented API', async () => {
    const t = setup()
    const settings = new SettingsService(t.db)
    const server = new LocalApiServer(createRoutes(t, { version: 'test' }), t.db, () => settings.agentApi().token)
    const port = await server.start(0)
    try {
      const base = `http://127.0.0.1:${port}/api/v1`
      const auth = { Authorization: `Bearer ${settings.agentApi().token}`, 'Content-Type': 'application/json' }
      const doc = (await (await fetch(`${base}/openapi.json`)).json()) as { paths: Record<string, unknown> }
      expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/api/v1/sets/{id}', '/api/v1/cards/{id}']))
      expect((await fetch(`${base}/sets?language=en`)).status).toBe(401)

      const set = (await (await fetch(`${base}/sets`, { method: 'POST', headers: auth, body: JSON.stringify({ language: 'en', name: 'Movie' }) })).json()) as { id: string }
      const card = (await (await fetch(`${base}/cards`, { method: 'POST', headers: auth, body: JSON.stringify({ language: 'en', setId: set.id, term: 'dull', meaning: 'boring' }) })).json()) as { id: string }
      const edited = (await (await fetch(`${base}/cards/${card.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ version: 1, meaning: 'boring, tedious' }) })).json()) as { meaning: string }
      expect(edited.meaning).toBe('boring, tedious')
      const renamed = (await (await fetch(`${base}/sets/${set.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ version: 1, name: 'Movies' }) })).json()) as { name: string }
      expect(renamed.name).toBe('Movies')
    } finally {
      await server.stop()
    }
  })

  it('12. Repeated create and grade requests do not create duplicate data or results', async () => {
    const t = setup()
    // Creating through the API with an idempotency key.
    const settings = new SettingsService(t.db)
    const server = new LocalApiServer(createRoutes(t, { version: 'test' }), t.db, () => settings.agentApi().token)
    const port = await server.start(0)
    try {
      const request = () =>
        fetch(`http://127.0.0.1:${port}/api/v1/cards`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${settings.agentApi().token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'create-dull' },
          body: JSON.stringify({ language: 'en', term: 'dull', meaning: 'boring' })
        })
      expect((await request()).status).toBe(201)
      expect((await request()).status).toBe(201)
      expect(t.cards.list('en')).toHaveLength(1)
    } finally {
      await server.stop()
    }
    // Resending a grade.
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    t.study.reveal(shown.presentationId)
    t.study.grade(shown.presentationId, 'forgot')
    expect(t.study.grade(shown.presentationId, 'forgot').duplicate).toBe(true)
    expect(t.db.prepare("SELECT COUNT(*) FROM review_log WHERE mode = 'recall'").pluck().get()).toBe(1)
  })
})

function captureError(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('Expected an error')
}
