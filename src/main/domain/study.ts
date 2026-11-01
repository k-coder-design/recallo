import { randomUUID } from 'node:crypto'
import { State } from 'ts-fsrs'
import type { Db } from '../db/database'
import type {
  Card,
  CardBack,
  Grade,
  GradeResult,
  NextCard,
  NextOptions,
  SpaceId,
  SetScope,
  StudyCounts,
  StudyMode,
  UndoResult
} from '../../shared/types'
import { hideMasked, maskExample } from '../../shared/masking'
import { checkAnswer, type AnswerCheck } from '../../shared/answerCheck'
import type { CardService } from './cards'
import { DomainError } from './errors'
import type { StudyLimits } from './limits'
import { parseProgress, serializeProgress, stateName, type Clock, type Scheduler } from './scheduler'
import { scopeCondition } from './sets'
import { gradeSchema, nextOptionsSchema, scopeSchema, spaceIdSchema } from './validation'

/** Показ карточки в сессии. Живёт в памяти: после перезапуска показ просто запрашивается заново. */
interface Presentation {
  cardId: string
  mode: StudyMode
  revealed: boolean
  /** Проверка введённого ответа, если вспоминание шло в режиме ввода (D50). */
  check?: AnswerCheck
}

/** Состояние знакомства карточки — сохраняется в истории, чтобы оценку можно было отменить. */
interface IntroState {
  introduced_at: string | null
  intro_due: string | null
}

interface ReviewRow {
  id: string
  card_id: string
  mode: StudyMode
  grade: Grade
  progress_after: string
}

const MAX_OPEN_PRESENTATIONS = 500
const MINUTE = 60_000
/** После знакомства первое вспоминание — в той же сессии, примерно через минуту (D21). */
export const INTRO_TO_RECALL_DELAY_MS = MINUTE
/** «Not yet» при знакомстве: показать знакомство снова через минуту, другие карточки — между. */
export const INTRO_RETRY_DELAY_MS = MINUTE

/** Новая карточка без знакомства. */
const NEEDS_INTRO = `p.state = ${State.New} AND p.introduced_at IS NULL`
/** Знакомство ещё не начиналось — только такие карточки ограничивает дневной лимит (D48). */
const FRESH = `${NEEDS_INTRO} AND p.intro_due IS NULL`
/** Знакомство начато и отложено («Not yet») — продолжается вне зависимости от лимита. */
const RETRY = `${NEEDS_INTRO} AND p.intro_due IS NOT NULL`
/** Новая карточка после знакомства, ещё ни разу не вспоминавшаяся. */
const INTRODUCED = `p.state = ${State.New} AND p.introduced_at IS NOT NULL`
const READY_NEW = `COALESCE(p.intro_due, '') <= @now`

export class StudyService {
  private readonly presentations = new Map<string, Presentation>()

  constructor(
    private readonly db: Db,
    private readonly cards: CardService,
    private readonly scheduler: Scheduler,
    private readonly limits: StudyLimits,
    private readonly now: Clock
  ) {}

  /** Счётчики области: все карточки языка, набор или «без набора» (GEN-05), с учётом дневного лимита новых (D48). */
  counts(spaceId: SpaceId, scope?: SetScope): StudyCounts {
    const id = spaceIdSchema.parse(spaceId)
    const condition = scopeCondition(scopeSchema.parse(scope))
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE
             WHEN p.state != ${State.New} AND p.due <= @now THEN 1
             WHEN ${INTRODUCED} AND ${READY_NEW} THEN 1
             ELSE 0 END), 0) AS due,
           COALESCE(SUM(CASE WHEN ${RETRY} THEN 1 ELSE 0 END), 0) AS retry,
           COALESCE(SUM(CASE WHEN ${FRESH} THEN 1 ELSE 0 END), 0) AS fresh
         FROM cards c JOIN card_progress p ON p.card_id = c.id
         WHERE c.space_id = @spaceId AND ${condition.sql}`
      )
      .get({ spaceId: id, now: this.now().toISOString(), ...condition.params }) as { due: number; retry: number; fresh: number }
    const newToday = this.limits.today(id)
    const allowed = Math.min(row.fresh, newToday.remaining)
    return { due: row.due, new: row.retry + allowed, newWaiting: row.fresh - allowed, newToday }
  }

  /**
   * Следующая карточка пространства (LANG-03). Порядок (SRS-08, D21):
   * наступившие повторения → первое вспоминание после знакомства → знакомство с новыми.
   * Область (набор) только сужает выбор: прогресс карточки общий (SRS-09).
   * После знакомства (afterNew) новая карточка уступает место другой карточке области (D56).
   */
  next(spaceId: SpaceId, options?: NextOptions): NextCard {
    const id = spaceIdSchema.parse(spaceId)
    const { scope, avoidCardId, allowEarly, afterNew } = nextOptionsSchema.parse(options)
    const condition = scopeCondition(scope)
    const params = { spaceId: id, now: this.now().toISOString(), ...condition.params }
    const counts = this.counts(id, scope)
    const pick = (where: string, order: string) =>
      this.db
        .prepare(
          `SELECT c.id FROM cards c JOIN card_progress p ON p.card_id = c.id
           WHERE c.space_id = @spaceId AND ${condition.sql} AND ${where} ORDER BY ${order} LIMIT 2`
        )
        .pluck()
        .all(params) as string[]

    const known = [
      ...pick(`p.state != ${State.New} AND p.due <= @now`, 'p.due, c.rowid'),
      ...pick(`${INTRODUCED} AND ${READY_NEW}`, 'p.intro_due, c.rowid')
    ]
    const candidates = [
      ...known,
      ...pick(`${RETRY} AND ${READY_NEW}`, 'p.intro_due, c.rowid'),
      ...(counts.newToday.remaining > 0 ? pick(FRESH, 'c.created_at, c.rowid') : [])
    ]
    // Между повторными показами одной карточки — другие, если они есть (SRS-10).
    let cardId = candidates.find((c) => c !== avoidCardId)
    if (afterNew && cardId !== undefined && !known.includes(cardId)) {
      // Новые не подряд (D56): раньше срока — уже знакомые слова, которые и так скоро вернутся;
      // в наборе — ещё и выученные слова этого набора, ближайшие к повторению.
      const mixIn = pick(
        `(p.state IN (${State.Learning}, ${State.Relearning}) OR ${INTRODUCED}` +
          (scope.kind === 'set' ? ` OR p.state = ${State.Review})` : ')'),
        `CASE WHEN p.state = ${State.New} THEN p.intro_due ELSE p.due END, c.rowid`
      )
      cardId = mixIn.find((c) => c !== avoidCardId) ?? cardId
    }
    cardId ??= candidates[0]

    if (!cardId) {
      // Остались только короткие повторы в будущем: можно подождать, показать раньше или
      // завершить сессию — без принудительного цикла (SRS-11).
      const upcoming = this.db
        .prepare(
          `SELECT c.id, CASE WHEN p.state = ${State.New} THEN p.intro_due ELSE p.due END AS at
           FROM cards c JOIN card_progress p ON p.card_id = c.id
           WHERE c.space_id = @spaceId AND ${condition.sql} AND (
             p.state IN (${State.Learning}, ${State.Relearning}) OR
             (p.state = ${State.New} AND p.intro_due > @now)
           )
           ORDER BY at LIMIT 2`
        )
        .all(params) as Array<{ id: string; at: string }>
      if (!upcoming[0]) return { kind: 'done', counts }
      if (!allowEarly) return { kind: 'wait', nextDueAt: upcoming[0].at, counts }
      // Раньше срока подряд одну и ту же карточку не показываем, если есть другая (SRS-10).
      cardId = (upcoming.find((c) => c.id !== avoidCardId) ?? upcoming[0]).id
    }

    return this.present(cardId, counts)
  }

  /**
   * Режим ввода (MVP-8, D50): проверяет введённое слово и раскрывает ответ. Это ещё не оценка —
   * итоговую оценку выбирает пользователь в grade, в том числе вопреки вердикту приложения.
   * Повторная проверка того же показа возвращает первую: ответ уже был виден.
   */
  check(presentationId: string, answer: string): { back: CardBack; check: AnswerCheck } {
    const presentation = this.requirePresentation(presentationId)
    if (presentation.mode !== 'recall') {
      throw new DomainError('VALIDATION', 'Typing the answer is only for recall cards')
    }
    if (!presentation.check) {
      if (presentation.revealed) throw new DomainError('VALIDATION', 'The answer is already shown')
      const card = this.cards.get(presentation.cardId)
      presentation.check = checkAnswer(String(answer ?? '').slice(0, 300), card.term, card.spaceId)
    }
    return { back: this.reveal(presentationId), check: presentation.check }
  }

  /** Раскрытие ответа само по себе не считается повторением (LEARN-07). */
  reveal(presentationId: string): CardBack {
    const presentation = this.requirePresentation(presentationId)
    presentation.revealed = true
    return this.backOf(this.cards.get(presentation.cardId))
  }

  /** Полное содержимое карточки: слово, произношение, значение и примеры с выделенным словом. */
  private backOf(card: Card): CardBack {
    return {
      term: card.term,
      forgotCount: this.forgotCount(card.id),
      transcription: card.transcription,
      emoji: card.emoji,
      meaning: card.meaning,
      ttsLang: this.cards.getSpace(card.spaceId).ttsLang,
      pronunciations: this.cards.pronunciations(card),
      examples: card.examples.map((e) => ({
        segments: maskExample(e.text, card.term, e.maskFragments, card.spaceId),
        translation: e.translation
      }))
    }
  }

  /**
   * Записывает результат показа. Повторная отправка для того же показа возвращает
   * уже сохранённый результат и ничего не меняет (LEARN-10, GEN-03).
   * Знакомство не трогает FSRS: оно только открывает карточку для вспоминания.
   */
  grade(presentationId: string, grade: Grade): GradeResult {
    const parsedGrade = gradeSchema.parse(grade)

    return this.db.transaction((): GradeResult => {
      const existing = this.db
        .prepare(
          'SELECT id, card_id, mode, grade, progress_after, undone_at FROM review_log WHERE presentation_id = ?'
        )
        .get(presentationId) as (ReviewRow & { undone_at: string | null }) | undefined
      // Отменённую оценку повторно не применяем: показ закончился, карточка показана заново.
      if (existing?.undone_at) throw new DomainError('PRESENTATION_EXPIRED', 'This grade was undone. Load the next card.')
      if (existing) return this.existingResult(existing)

      const presentation = this.requirePresentation(presentationId)
      if (!presentation.revealed) {
        throw new DomainError('NOT_REVEALED', 'You can grade a card only after revealing the answer')
      }

      const now = this.now()
      const before = this.cards.readProgress(presentation.cardId)
      const introBefore = this.db
        .prepare('SELECT introduced_at, intro_due FROM card_progress WHERE card_id = ?')
        .get(presentation.cardId) as IntroState
      const after = presentation.mode === 'recall' ? this.scheduler.apply(before, parsedGrade, now) : before
      const reviewId = randomUUID()

      this.db
        .prepare(
          `INSERT INTO review_log
             (id, card_id, presentation_id, mode, grade, source, reviewed_at, progress_before, progress_after, intro_before,
              typed_answer, auto_verdict, overridden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          reviewId,
          presentation.cardId,
          presentationId,
          presentation.mode,
          parsedGrade,
          'manual',
          now.toISOString(),
          serializeProgress(before),
          serializeProgress(after),
          JSON.stringify(introBefore),
          presentation.check?.typed ?? null,
          presentation.check?.verdict ?? null,
          presentation.check ? Number(parsedGrade !== presentation.check.suggestedGrade) : null
        )

      let nextDue: string
      if (presentation.mode === 'recall') {
        this.cards.writeProgress(presentation.cardId, after)
        nextDue = after.due.toISOString()
      } else {
        const remembered = parsedGrade === 'remembered'
        nextDue = new Date(now.getTime() + (remembered ? INTRO_TO_RECALL_DELAY_MS : INTRO_RETRY_DELAY_MS)).toISOString()
        this.db
          .prepare('UPDATE card_progress SET introduced_at = ?, intro_due = ? WHERE card_id = ?')
          .run(remembered ? now.toISOString() : null, nextDue, presentation.cardId)
      }
      this.presentations.delete(presentationId)

      return {
        reviewId,
        cardId: presentation.cardId,
        mode: presentation.mode,
        grade: parsedGrade,
        nextDue,
        state: stateName(after.state),
        duplicate: false
      }
    })()
  }

  /**
   * Отменяет последнюю оценку карточки: прогресс и знакомство возвращаются как были,
   * запись истории помечается отменённой, карточка показывается снова.
   * Повторная отмена той же записи ничего не меняет.
   */
  undo(reviewId: string, scope?: SetScope): UndoResult {
    const parsedScope = scopeSchema.parse(scope)
    return this.db.transaction((): UndoResult => {
      const row = this.db.prepare('SELECT * FROM review_log WHERE id = ?').get(reviewId) as
        | (ReviewRow & { progress_before: string; intro_before: string | null; undone_at: string | null })
        | undefined
      if (!row) throw new DomainError('NOT_FOUND', 'Nothing to undo: this grade was not found', { reviewId })
      const card = this.cards.get(row.card_id)

      if (!row.undone_at) {
        const later = this.db
          .prepare(
            `SELECT COUNT(*) FROM review_log
             WHERE card_id = ? AND undone_at IS NULL AND id != ? AND reviewed_at >= (SELECT reviewed_at FROM review_log WHERE id = ?)`
          )
          .pluck()
          .get(row.card_id, reviewId, reviewId) as number
        const current = this.db.prepare('SELECT fsrs FROM card_progress WHERE card_id = ?').pluck().get(row.card_id)
        if (later > 0 || current !== row.progress_after) {
          throw new DomainError('CONFLICT', 'Only the most recent grade of an unchanged card can be undone')
        }

        this.cards.writeProgress(row.card_id, parseProgress(row.progress_before))
        // Для записей до появления intro_before: отмена знакомства возвращает карточку к знакомству.
        const intro: IntroState | null = row.intro_before
          ? (JSON.parse(row.intro_before) as IntroState)
          : row.mode === 'intro'
            ? { introduced_at: null, intro_due: null }
            : null
        if (intro) {
          this.db
            .prepare('UPDATE card_progress SET introduced_at = ?, intro_due = ? WHERE card_id = ?')
            .run(intro.introduced_at, intro.intro_due, row.card_id)
        }
        this.db.prepare('UPDATE review_log SET undone_at = ? WHERE id = ?').run(this.now().toISOString(), reviewId)
      }

      const undone = { ...this.existingResult(row), duplicate: Boolean(row.undone_at) }
      return { undone, next: this.present(card.id, this.counts(card.spaceId, parsedScope)) }
    })()
  }

  /** Сколько раз карточку забывали при вспоминании (без отменённых оценок). */
  private forgotCount(cardId: string): number {
    return this.db
      .prepare(
        `SELECT COUNT(*) FROM review_log
         WHERE card_id = ? AND mode = 'recall' AND grade = 'forgot' AND undone_at IS NULL`
      )
      .pluck()
      .get(cardId) as number
  }

  private existingResult(row: ReviewRow): GradeResult {
    const after = parseProgress(row.progress_after)
    let nextDue = after.due.toISOString()
    if (row.mode === 'intro') {
      const progress = this.db.prepare('SELECT intro_due FROM card_progress WHERE card_id = ?').get(row.card_id) as
        | { intro_due: string | null }
        | undefined
      nextDue = progress?.intro_due ?? nextDue
    }
    return {
      reviewId: row.id,
      cardId: row.card_id,
      mode: row.mode,
      grade: row.grade,
      nextDue,
      state: stateName(after.state),
      duplicate: true
    }
  }

  private present(cardId: string, counts: StudyCounts): NextCard {
    const card = this.cards.get(cardId)
    const mode: StudyMode = card.progress.state === 'new' && card.progress.introducedAt === null ? 'intro' : 'recall'
    const presentationId = randomUUID()

    if (this.presentations.size >= MAX_OPEN_PRESENTATIONS) {
      const oldest = this.presentations.keys().next().value
      if (oldest !== undefined) this.presentations.delete(oldest)
    }
    // Знакомство показывает всё сразу (D53): угадывать нечего, поэтому показ уже раскрыт.
    this.presentations.set(presentationId, { cardId, mode, revealed: mode === 'intro' })

    if (mode === 'intro') {
      return { kind: 'card', mode, presentationId, cardId, back: this.backOf(card), counts }
    }
    return {
      kind: 'card',
      mode,
      presentationId,
      cardId,
      front: {
        meaning: card.meaning,
        emoji: card.emoji,
        examples: card.examples.map((e) => hideMasked(maskExample(e.text, card.term, e.maskFragments, card.spaceId)))
      },
      counts
    }
  }

  private requirePresentation(presentationId: string): Presentation {
    const presentation = this.presentations.get(presentationId)
    if (!presentation) {
      throw new DomainError('PRESENTATION_EXPIRED', 'This card view has expired. Load the next card.')
    }
    return presentation
  }
}
