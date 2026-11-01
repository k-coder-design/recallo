// Приёмочные тесты: критерии раздела 13 требований (duocards_requirements.md).
// Голосовые критерии 6 и 8 сняты вместе с MVP-5 (D45): голосового ответа в приложении нет.
import { describe, expect, it } from 'vitest'
import { LocalApiServer } from './main/api/http'
import { createRoutes } from './main/api/routes'
import { SettingsService } from './main/domain/settings'
import { toAppError } from './main/domain/errors'
import { expectIntro, expectRecall, MINUTE, setup } from './main/domain/test-helpers'

describe('Раздел 13. Ключевые критерии приёмки', () => {
  it('1. При обучении английского пространства испанские карточки не появляются', () => {
    const t = setup()
    t.addCard({ spaceId: 'es', term: 'correr', meaning: 'бегать' })
    t.addCard({ spaceId: 'en', term: 'run', meaning: 'бегать' })
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

  it('2. До переворота видны значение и примеры, выражение во всех примерах скрыто', () => {
    const t = setup()
    t.addCard({
      term: 'am used to',
      meaning: 'быть привыкшим к чему-либо',
      examples: [{ text: 'I am used to working remotely.' }, { text: "I'm used to it, I am used to noise.", maskFragments: ["'m used to"] }]
    })
    t.introduceAll()
    const front = expectRecall(t.study.next('en')).front
    expect(front.meaning).toBe('быть привыкшим к чему-либо')
    expect(front.examples).toHaveLength(2)
    expect(JSON.stringify(front)).not.toMatch(/used to/i)
    expect(front.examples[1]?.filter((s) => s.masked)).toHaveLength(2)
  })

  it('3. После переворота доступны полный ответ, полные примеры и озвучивание', () => {
    const t = setup()
    t.addCard({ term: 'dull', meaning: 'скучный', examples: [{ text: 'The film is dull.' }] })
    t.introduceAll()
    const shown = expectRecall(t.study.next('en'))
    const back = t.study.reveal(shown.presentationId)
    expect(back.term).toBe('dull')
    expect(back.examples[0]?.segments.map((s) => s.text).join('')).toBe('The film is dull.')
    expect(back.ttsLang).toBe('en-US')
  })

  it('4. При удалении набора выбор обязателен: сохранить или удалить карточки; отмена ничего не меняет', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    t.addCard({ term: 'dull', setId: set.id })
    // Без выбора политики (как при «Отмене» — запрос не отправлен или пуст) ничего не удаляется.
    expect(toAppError(captureError(() => t.sets.delete(set.id, undefined))).code).toBe('VALIDATION')
    expect(t.sets.get(set.id).cardCount).toBe(1)
    expect(t.sets.delete(set.id, 'delete-cards')).toEqual({ affectedCards: 1 })
    expect(t.cards.list('en')).toHaveLength(0)
  })

  it('5. Сохранённые при удалении набора карточки доступны без набора и сохраняют прогресс', () => {
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

  it('7. Неверный ответ возвращает карточку в очередь; повторные ошибки не исключают её', () => {
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

  it('9. Ручное обучение доступно без микрофона: полный цикл без голосовых функций', () => {
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

  it('10. Одна карточка сохраняет единый прогресс при обучении набора и всех карточек языка', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    const card = t.addCard({ term: 'dull', setId: set.id })
    const scope = { kind: 'set' as const, setId: set.id }
    const intro = expectIntro(t.study.next('en', { scope }))
    t.study.reveal(intro.presentationId)
    t.study.grade(intro.presentationId, 'remembered')
    t.advance(MINUTE)
    // В общей очереди карточка уже знакома и идёт на вспоминание.
    const recall = expectRecall(t.study.next('en'))
    expect(recall.cardId).toBe(card.id)
    t.study.reveal(recall.presentationId)
    t.study.grade(recall.presentationId, 'remembered')
    expect(t.cards.get(card.id).progress.reps).toBe(1)
    expect(t.study.counts('en', scope)).toEqual(t.study.counts('en'))
  })

  it('11. Авторизованный агент редактирует наборы и карточки через документированный API', async () => {
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
      const card = (await (await fetch(`${base}/cards`, { method: 'POST', headers: auth, body: JSON.stringify({ language: 'en', setId: set.id, term: 'dull', meaning: 'скучный' }) })).json()) as { id: string }
      const edited = (await (await fetch(`${base}/cards/${card.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ version: 1, meaning: 'скучный, нудный' }) })).json()) as { meaning: string }
      expect(edited.meaning).toBe('скучный, нудный')
      const renamed = (await (await fetch(`${base}/sets/${set.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ version: 1, name: 'Movies' }) })).json()) as { name: string }
      expect(renamed.name).toBe('Movies')
    } finally {
      await server.stop()
    }
  })

  it('12. Повтор запросов создания и оценки не приводит к дублям данных или результатов', async () => {
    const t = setup()
    // Создание через API с ключом идемпотентности.
    const settings = new SettingsService(t.db)
    const server = new LocalApiServer(createRoutes(t, { version: 'test' }), t.db, () => settings.agentApi().token)
    const port = await server.start(0)
    try {
      const request = () =>
        fetch(`http://127.0.0.1:${port}/api/v1/cards`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${settings.agentApi().token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'create-dull' },
          body: JSON.stringify({ language: 'en', term: 'dull', meaning: 'скучный' })
        })
      expect((await request()).status).toBe(201)
      expect((await request()).status).toBe(201)
      expect(t.cards.list('en')).toHaveLength(1)
    } finally {
      await server.stop()
    }
    // Повторная отправка оценки.
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
