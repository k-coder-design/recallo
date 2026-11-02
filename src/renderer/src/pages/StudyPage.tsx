import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Card,
  CardBack,
  CardSet,
  Grade,
  NextCard,
  SetScope,
  SpaceId,
  StudyCounts,
  StudyMode,
  Swell
} from '../../../shared/types'
import type { AnswerCheck } from '../../../shared/answerCheck'
import { AnswerInput, VerdictPanel } from '../components/TypedAnswer'
import {
  EXTEND_MINUTES,
  extendTimer,
  isTimeUp,
  remainingMs,
  SESSION_LENGTHS,
  startTimer,
  type SessionLength,
  type SessionTimer
} from '../../../shared/sessionTimer'
import { BackFace, DeleteButton, EditButton, RecallFrontFace } from '../components/CardFace'
import { Modal } from '../components/Modal'
import { SwellCard } from '../components/Swell'
import { SwipeCard } from '../components/SwipeCard'
import { ApiError, call, errorMessage } from '../lib/api'
import { backupAge, backupOverdue, markBackedUp } from '../lib/backupReminder'
import { formatCountdown, plural } from '../lib/format'
import { IS_PHONE } from '../lib/platform'
import { usePersistentState } from '../lib/usePersistentState'
import { CardEditor } from './CardEditor'

interface Props {
  spaceId: SpaceId
  /** Progress changed — refresh the language's shared counters (the Study tab badge); counts — already known. */
  onProgress: (counts?: StudyCounts) => void
  onGoToCards: () => void
  /** A session started or ended — on the phone App hides the header and tabs (W2). */
  onSessionChange?: (active: boolean) => void
}

/** Arrows hint at the ← / → keys; a phone has no keys, so the swipe hint explains the direction. */
const arrowLeft = IS_PHONE ? '' : '← '
const arrowRight = IS_PHONE ? '' : ' →'

/** The "clarify the definition" hint appears on words that are often forgotten (SRS-12). */
const FORGOT_HINT_THRESHOLD = 3

const scopeKey = (scope: SetScope) => (scope.kind === 'set' ? `set:${scope.setId}` : scope.kind)
const scopeFromKey = (key: string): SetScope =>
  key.startsWith('set:') ? { kind: 'set', setId: key.slice(4) } : key === 'none' ? { kind: 'none' } : { kind: 'all' }

type Phase = 'idle' | 'session' | 'timeup' | 'summary'

/** How to answer in recall (MVP-8): self-check or typing the word. */
const ANSWER_MODES = ['self', 'type'] as const
type AnswerMode = (typeof ANSWER_MODES)[number]

const LENGTH_LABELS: Record<SessionLength, string> = { off: 'No limit', '5': '5 min', '10': '10 min', '15': '15 min' }

/** The current time, updated every half second while the countdown runs. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

const EMPTY_STATS = { introduced: 0, remembered: 0, forgot: 0 }

/** Recall labels. A first meeting has no self-grading — only "next" (D53). */
const RECALL_TEXT = {
  reveal: 'Show answer',
  left: 'Forgot',
  right: 'Remembered',
  question: 'Did you remember it?',
  hint: 'Say the word to yourself first, then check'
} as const
const MEETING_LABELS = { left: 'Next', right: 'Next' }

/** Half of the card flip: how long the front turns edge-on while the back is prepared. */
const FLIP_HALF_MS = 180
/** The read new word leaving the table — the duration of the .leave-* animation in styles.css. */
const LEAVE_MS = 200

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Pause while the animation runs; without animation — immediately. */
const motionPause = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion() ? 0 : ms))

type Flip = { presentationId: string; phase: 'out' | 'in' }
type Direction = 'left' | 'right'
/**
 * Card change after a new word: the next new word is "dealt" from the right, like from a deck (deal),
 * and a recall rises from below — it shows that a check is starting (rise).
 */
type Enter = { presentationId: string; kind: 'deal' | 'rise' }

/** The back shown right away: for a first meeting it is the whole card. */
const backOf = (next: NextCard): CardBack | null => (next.kind === 'card' && next.mode === 'intro' ? next.back : null)

export function StudyPage({ spaceId, onProgress, onGoToCards, onSessionChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [scope, setScope] = useState<SetScope>({ kind: 'all' })
  const [sets, setSets] = useState<CardSet[]>([])
  const [counts, setCounts] = useState<StudyCounts | null>(null)
  const [lastGrade, setLastGrade] = useState<{ reviewId: string; cardId: string; mode: StudyMode; grade: Grade } | null>(
    null
  )
  const [current, setCurrent] = useState<NextCard | null>(null)
  const [back, setBack] = useState<CardBack | null>(null)
  const [check, setCheck] = useState<AnswerCheck | null>(null)
  const [answerMode, setAnswerMode] = usePersistentState<AnswerMode>('answerMode', 'self', ANSWER_MODES)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState(EMPTY_STATS)
  const [editing, setEditing] = useState<Card | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [swell, setSwell] = useState<Swell | null>(null)
  const [sessionLength, setSessionLength] = usePersistentState<SessionLength>('sessionLength', 'off', SESSION_LENGTHS)
  const [timer, setTimer] = useState<SessionTimer | null>(null)
  const [flip, setFlip] = useState<Flip | null>(null)
  const [leaving, setLeaving] = useState<{ presentationId: string; direction: Direction } | null>(null)
  const [entering, setEntering] = useState<Enter | null>(null)
  /** The next card comes right after a new word — it needs an entrance animation. */
  const afterMeeting = useRef(false)
  // The page needs the time only while waiting; the header countdown ticks in SessionClock without touching the card.
  const now = useNow(phase === 'session' && timer !== null && current?.kind === 'wait')
  const busy = useRef(false)
  const lastCardId = useRef<string | undefined>(undefined)
  /** New-word limit reached and "practice current" chosen: cards come without waiting until the session ends (D55). */
  const practicing = useRef(false)

  useEffect(() => {
    onSessionChange?.(phase === 'session')
  }, [phase, onSessionChange])
  useEffect(() => () => onSessionChange?.(false), [onSessionChange])

  useEffect(() => {
    call('sets.list', spaceId)
      .then((list) => {
        setSets(list)
        // The chosen set may have been deleted — then study all cards of the language.
        setScope((s) => (s.kind === 'set' && !list.some((set) => set.id === s.setId) ? { kind: 'all' } : s))
      })
      .catch(() => setSets([]))
  }, [spaceId])

  // Today's swell is recalculated on the start screen and after a session.
  useEffect(() => {
    if (phase === 'session') return
    call('stats.overview', spaceId)
      .then((overview) => setSwell(overview.swell))
      .catch(() => setSwell(null))
  }, [phase, spaceId])

  useEffect(() => {
    if (phase !== 'idle') return
    call('study.counts', spaceId, scope)
      .then(setCounts)
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [phase, spaceId, scope])

  const loadNext = useCallback(
    async (allowEarly = false) => {
      busy.current = true
      setError(null)
      try {
        const next = await call('study.next', spaceId, {
          scope,
          avoidCardId: lastCardId.current,
          allowEarly: allowEarly || practicing.current,
          // New words not back to back: after a first meeting — another card, if there is one (D56).
          afterNew: afterMeeting.current
        })
        setBack(backOf(next))
        setCurrent(next)
        if (afterMeeting.current && next.kind === 'card') {
          setEntering({ presentationId: next.presentationId, kind: next.mode === 'intro' ? 'deal' : 'rise' })
        }
        setCounts(next.counts)
        // The whole language's counters already came with the card — no second request needed.
        onProgress(scope.kind === 'all' ? next.counts : undefined)
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        afterMeeting.current = false
        busy.current = false
      }
    },
    [spaceId, scope, onProgress]
  )

  /** Editing a card mid-session: available once the word is visible (first meeting or back side). */
  const openEditor = useCallback(async () => {
    if (current?.kind !== 'card') return
    try {
      setEditing(await call('cards.get', current.cardId))
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [current])

  const afterEdit = useCallback(
    async () => {
      setEditing(null)
      if (current?.kind !== 'card') return
      try {
        // The presentation is still valid: re-read the back (for a first meeting — the whole card) with the new content.
        if (back) setBack(await call('study.reveal', current.presentationId))
      } catch (e) {
        if (e instanceof ApiError && e.code === 'PRESENTATION_EXPIRED') return void loadNext()
        setError(errorMessage(e))
      }
    },
    [current, back, loadNext]
  )

  const start = () => {
    setStats(EMPTY_STATS)
    setLastGrade(null)
    lastCardId.current = undefined
    practicing.current = false
    setTimer(startTimer(sessionLength, Date.now()))
    setPhase('session')
    void loadNext()
  }

  /** "Learn 5 more today": raise the new-word limit once (D48); in a session, show the next word right away. */
  const learnMore = async (continueSession: boolean) => {
    setError(null)
    try {
      await call('study.learnMore', spaceId)
      if (continueSession) await loadNext()
      else setCounts(await call('study.counts', spaceId, scope))
      onProgress()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  /** New-word limit reached but time is left: practice the words already started without waiting for them to be due (D55). */
  const practiceCurrent = () => {
    practicing.current = true
    void loadNext()
  }

  /** Time is up: the current card is already graded; show the summary with options to finish or extend (D43). */
  const timeUp = useCallback(() => {
    setPhase('timeup')
    setCurrent(null)
    setBack(null)
  }, [])

  const extend = (minutes: number) => {
    setTimer((t) => extendTimer(t, minutes, Date.now()))
    setPhase('session')
    void loadNext()
  }

  // While waiting for a short review there is nothing to grade — show the summary right away.
  useEffect(() => {
    if (phase === 'session' && current?.kind === 'wait' && isTimeUp(timer, now)) timeUp()
  }, [phase, current, timer, now, timeUp])

  // A session can be finished at any time: all grades are already saved (LEARN-09).
  const finish = useCallback(() => {
    setPhase('summary')
    setCurrent(null)
    setBack(null)
  }, [])

  // A new presentation means a new answer check.
  useEffect(() => setCheck(null), [current])

  /** First meeting with a word: everything is visible at once, nothing to grade (D53). */
  const meeting = current?.kind === 'card' && current.mode === 'intro'
  /** Recall in typing mode: a field for the word instead of "Show answer" (D50). */
  const typing = answerMode === 'type' && current?.kind === 'card' && current.mode === 'recall'

  const submitAnswer = useCallback(
    async (answer: string) => {
      if (current?.kind !== 'card' || back || busy.current) return
      busy.current = true
      setFlip({ presentationId: current.presentationId, phase: 'out' })
      try {
        const [result] = await Promise.all([call('study.check', current.presentationId, answer), motionPause(FLIP_HALF_MS)])
        setBack(result.back)
        setCheck(result.check)
      } catch (e) {
        if (e instanceof ApiError && e.code === 'PRESENTATION_EXPIRED') {
          busy.current = false
          return void loadNext()
        }
        setError(errorMessage(e))
      } finally {
        busy.current = false
        setFlip({ presentationId: current.presentationId, phase: 'in' })
      }
    },
    [current, back, loadNext]
  )

  /** Flip (D53): the front turns edge-on while the main process prepares the back, then the back turns in. */
  const reveal = useCallback(async () => {
    if (current?.kind !== 'card' || back || busy.current || typing) return
    busy.current = true
    setFlip({ presentationId: current.presentationId, phase: 'out' })
    try {
      const [revealed] = await Promise.all([call('study.reveal', current.presentationId), motionPause(FLIP_HALF_MS)])
      setBack(revealed)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PRESENTATION_EXPIRED') {
        busy.current = false
        return void loadNext()
      }
      setError(errorMessage(e))
    } finally {
      busy.current = false
      setFlip({ presentationId: current.presentationId, phase: 'in' })
    }
  }, [current, back, loadNext, typing])

  /** direction — where the read new word leaves: where it was swiped, otherwise left. */
  const grade = useCallback(
    async (value: Grade, direction: Direction = 'left') => {
      if (current?.kind !== 'card' || !back || busy.current) return
      busy.current = true
      const meetingDone = current.mode === 'intro'
      // The new word leaves the table while the main process records the meeting.
      if (meetingDone) setLeaving({ presentationId: current.presentationId, direction })
      try {
        const [result] = await Promise.all([
          call('study.grade', current.presentationId, value),
          meetingDone ? motionPause(LEAVE_MS) : undefined
        ])
        if (!result.duplicate) {
          setStats((s) => {
            if (result.mode === 'recall') return { ...s, [value]: s[value] + 1 }
            return value === 'remembered' ? { ...s, introduced: s.introduced + 1 } : s
          })
          setLastGrade({ reviewId: result.reviewId, cardId: result.cardId, mode: result.mode, grade: value })
        }
        lastCardId.current = current.cardId
      } catch (e) {
        busy.current = false
        setLeaving(null)
        if (e instanceof ApiError && e.code === 'PRESENTATION_EXPIRED') return void loadNext()
        return setError(errorMessage(e))
      }
      busy.current = false
      if (isTimeUp(timer, Date.now())) return timeUp()
      afterMeeting.current = meetingDone
      await loadNext()
    },
    [current, back, loadNext, timer, timeUp]
  )

  /**
   * Deleting a card mid-session: together with its progress and history, as in Cards, then the next card.
   * Undoing this card's last grade is impossible after deletion — its button is hidden.
   */
  const deleteCurrent = useCallback(async () => {
    if (current?.kind !== 'card' || busy.current) return
    busy.current = true
    try {
      await call('cards.delete', current.cardId)
    } catch (e) {
      busy.current = false
      setConfirmingDelete(false)
      return setError(errorMessage(e))
    }
    busy.current = false
    setConfirmingDelete(false)
    setLastGrade((last) => (last?.cardId === current.cardId ? null : last))
    lastCardId.current = undefined
    await loadNext()
  }, [current, loadNext])

  /** Undo the last grade: progress is restored, the card is shown again. */
  const undo = useCallback(async () => {
    if (!lastGrade || busy.current) return
    busy.current = true
    setError(null)
    try {
      const { undone, next } = await call('study.undo', lastGrade.reviewId, scope)
      if (!undone.duplicate) {
        setStats((s) => {
          if (lastGrade.mode === 'recall') return { ...s, [lastGrade.grade]: Math.max(0, s[lastGrade.grade] - 1) }
          return lastGrade.grade === 'remembered' ? { ...s, introduced: Math.max(0, s.introduced - 1) } : s
        })
      }
      setLastGrade(null)
      lastCardId.current = undefined
      setBack(backOf(next))
      setPhase('session')
      setCurrent(next)
      setCounts(next.counts)
      onProgress(scope.kind === 'all' ? next.counts : undefined)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      busy.current = false
    }
  }, [lastGrade, scope, onProgress])

  useEffect(() => {
    // While the editor or delete confirmation is open, keys belong to them: Esc closes the dialog, not the session.
    if (phase !== 'session' || editing || confirmingDelete) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (event.repeat || (target instanceof HTMLElement && target.closest('input, textarea'))) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        void undo()
      } else if (meeting) {
        // First meeting: any "next" key moves on; there is no "don't remember" here.
        if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowRight') {
          event.preventDefault()
          void grade('remembered')
        } else if (event.key === 'Escape') finish()
      } else if (event.key === 'Enter' && check) {
        // Typing mode: Enter accepts the grade suggested by the app.
        event.preventDefault()
        void grade(check.suggestedGrade)
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        void reveal()
      } else if (event.key === 'ArrowRight') void grade('remembered')
      else if (event.key === 'ArrowLeft') void grade('forgot')
      else if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, editing, confirmingDelete, reveal, grade, finish, undo, check, meeting])

  if (phase === 'idle') {
    const total = counts ? counts.due + counts.new : 0
    return (
      <section className="page center">
        <div className="start-panel">
          {swell && <SwellCard swell={swell} />}
          <div className="session-setup">
            {counts && (
              <div className="setup-counts">
                <div className="setup-count">
                  <strong>{counts.due}</strong>
                  <span>
                    To review
                    <small>waves to ride</small>
                  </span>
                </div>
                <div className="setup-count">
                  <strong>{counts.new}</strong>
                  <span>
                    New
                    <small>calm water</small>
                  </span>
                </div>
              </div>
            )}
            {counts && <NewToday counts={counts} onLearnMore={() => void learnMore(false)} />}
            <div className="setup-controls">
              <label className="setup-field scope-picker">
                <span>Study</span>
                <select value={scopeKey(scope)} onChange={(e) => setScope(scopeFromKey(e.target.value))}>
                  <option value="all">All cards</option>
                  {sets.map((set) => (
                    <option key={set.id} value={`set:${set.id}`}>
                      {set.name} ({set.cardCount})
                    </option>
                  ))}
                  <option value="none">No set</option>
                </select>
              </label>
              <div className="setup-field">
                <span>Answer</span>
                <div className="length-options" role="radiogroup" aria-label="Answer mode">
                  {ANSWER_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={answerMode === mode}
                      className={answerMode === mode ? 'active' : ''}
                      onClick={() => setAnswerMode(mode)}
                    >
                      {mode === 'self' ? 'Self-check' : 'Type'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setup-field">
                <span>Length</span>
                <div className="length-options" role="radiogroup" aria-label="Session length">
                  {SESSION_LENGTHS.map((length) => (
                    <button
                      key={length}
                      type="button"
                      role="radio"
                      aria-checked={sessionLength === length}
                      className={sessionLength === length ? 'active' : ''}
                      onClick={() => setSessionLength(length)}
                    >
                      {LENGTH_LABELS[length]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" className="button primary large paddle" onClick={start}>
              Paddle out
            </button>
          </div>
          {counts && total === 0 && counts.newWaiting === 0 && (
            <p className="muted">
              Nothing to study right now.{' '}
              <button type="button" className="link-button" onClick={onGoToCards}>
                Add cards
              </button>
            </p>
          )}
          {IS_PHONE && counts && (total > 0 || counts.newWaiting > 0) && <BackupReminder />}
        </div>
      </section>
    )
  }

  if (phase === 'timeup') {
    const answered = stats.remembered + stats.forgot
    return (
      <section className="page center">
        <div className="start-panel time-up">
          <p className="swell-eyebrow">{timer?.plannedMinutes ?? 0} minutes on the water</p>
          <h1>Time’s up</h1>
          <p>
            {stats.introduced > 0 && `Met ${stats.introduced} new ${plural(stats.introduced, 'word', 'words')}. `}
            {answered === 0
              ? 'No recall answers yet.'
              : `${answered} ${plural(answered, 'answer', 'answers')}: remembered ${stats.remembered}, forgot ${stats.forgot}.`}
          </p>
          <p className="muted">Your progress is saved. Catch a few more waves?</p>
          <div className="row extend-actions">
            {EXTEND_MINUTES.map((minutes) => (
              <button key={minutes} type="button" className="button" onClick={() => extend(minutes)}>
                Extend by {minutes} min
              </button>
            ))}
          </div>
          <button type="button" className="button primary large" onClick={finish}>
            Finish
          </button>
          {lastGrade && (
            <button type="button" className="link-button" onClick={() => void undo()}>
              ↶ Undo the last answer
            </button>
          )}
        </div>
      </section>
    )
  }

  if (phase === 'summary') {
    const total = stats.remembered + stats.forgot
    return (
      <section className="page center">
        <div className="start-panel">
          <h1>Session complete</h1>
          {stats.introduced > 0 && (
            <p>
              Met {stats.introduced} new {plural(stats.introduced, 'word', 'words')}.
            </p>
          )}
          <p>
            {total === 0
              ? 'No recall answers in this session.'
              : `${total} ${plural(total, 'answer', 'answers')}: remembered ${stats.remembered}, forgot ${stats.forgot}.`}
          </p>
          <p className="muted">Your progress is saved.</p>
          {swell && <SwellCard swell={swell} />}
          <button type="button" className="button primary" onClick={() => setPhase('idle')}>
            Done
          </button>
        </div>
      </section>
    )
  }

  const scopeName =
    scope.kind === 'none' ? 'No set' : scope.kind === 'set' ? (sets.find((s) => s.id === scope.setId)?.name ?? 'Set') : ''
  return (
    <section className="page study">
      {/* Session bar — one line: a long set name is cut, buttons don't shrink. */}
      <div className="study-bar">
        <div className="study-bar-info">
          {scope.kind !== 'all' && (
            <span className="scope-chip" title={scopeName}>
              {scopeName}
            </span>
          )}
          <span className="study-stats">
            <span className="stat-new" tabIndex={IS_PHONE ? 0 : undefined} data-tooltip="New words met">
              ✨ {stats.introduced}
            </span>
            <span className="stat-remembered" tabIndex={IS_PHONE ? 0 : undefined} data-tooltip="Remembered">
              ✓ {stats.remembered}
            </span>
            <span className="stat-forgot" tabIndex={IS_PHONE ? 0 : undefined} data-tooltip="Forgot">
              ✗ {stats.forgot}
            </span>
          </span>
        </div>
        <div className="study-bar-actions">
          {timer && <SessionClock timer={timer} />}
          {lastGrade && (
            <button
              type="button"
              className="bar-button icon"
              onClick={() => void undo()}
              data-tooltip="Undo last answer · ⌘Z"
              aria-label="Undo the last grade"
            >
              ↶
            </button>
          )}
          <button type="button" className="bar-button" onClick={finish}>
            End session
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {current?.kind === 'card' && (
        <>
          <SwipeCard
            key={current.presentationId}
            className={[
              meeting && 'new-word-card',
              entering?.presentationId === current.presentationId && `enter-${entering.kind}`,
              flip?.presentationId === current.presentationId && `flip-${flip.phase}`,
              leaving?.presentationId === current.presentationId && `leave-${leaving.direction}`
            ]
              .filter(Boolean)
              .join(' ')}
            swipeEnabled={back !== null}
            labels={meeting ? MEETING_LABELS : RECALL_TEXT}
            onTap={meeting || typing ? undefined : () => void reveal()}
            onSwipe={(direction) => void grade(meeting || direction === 'right' ? 'remembered' : 'forgot', direction)}
          >
            {back && <EditButton onClick={() => void openEditor()} />}
            <DeleteButton onClick={() => setConfirmingDelete(true)} />
            {back ? <BackFace back={back} mode={current.mode} /> : current.mode === 'recall' && <RecallFrontFace front={current.front} />}
          </SwipeCard>

          {meeting ? (
            <div className="study-controls">
              <div className="study-actions">
                <button type="button" className="button primary large" onClick={() => void grade('remembered')}>
                  Continue{arrowRight}
                  <kbd>Space</kbd>
                </button>
              </div>
              <p className="muted small">Read it, listen to it. You’ll try to recall it in about a minute.</p>
            </div>
          ) : (
            <div className="study-controls">
              {back && back.forgotCount >= FORGOT_HINT_THRESHOLD && (
                <p className="forgot-hint">
                  💡 You’ve forgotten this word {back.forgotCount} times. A clearer meaning or a better example often
                  helps.{' '}
                  <button type="button" className="link-button" onClick={() => void openEditor()}>
                    Edit card
                  </button>
                </p>
              )}
              {check && <VerdictPanel check={check} />}
              {back && !check && <p className="question">{RECALL_TEXT.question}</p>}
              {typing && !back && <AnswerInput key={current.presentationId} onSubmit={(answer) => void submitAnswer(answer)} />}
              <div className="study-actions">
                {back && check ? (
                  // The user decides either way: the suggested grade is large, the opposite one is next to it.
                  check.suggestedGrade === 'remembered' ? (
                    <>
                      <button type="button" className="button forgot override" onClick={() => void grade('forgot')}>
                        {arrowLeft}Count as forgot
                      </button>
                      <button type="button" className="button remembered large" onClick={() => void grade('remembered')}>
                        Remembered{arrowRight}
                        <kbd>Enter</kbd>
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="button forgot large" onClick={() => void grade('forgot')}>
                        {arrowLeft}Forgot
                        <kbd>Enter</kbd>
                      </button>
                      <button type="button" className="button remembered override" onClick={() => void grade('remembered')}>
                        I was right{arrowRight}
                      </button>
                    </>
                  )
                ) : back ? (
                  <>
                    <button type="button" className="button forgot large" onClick={() => void grade('forgot')}>
                      {arrowLeft}
                      {RECALL_TEXT.left}
                    </button>
                    <button type="button" className="button remembered large" onClick={() => void grade('remembered')}>
                      {RECALL_TEXT.right}
                      {arrowRight}
                    </button>
                  </>
                ) : (
                  !typing && (
                    <button type="button" className="button primary large" onClick={() => void reveal()}>
                      {RECALL_TEXT.reveal}
                      <kbd>Space</kbd>
                    </button>
                  )
                )}
              </div>
              <p className="muted small">
                {back
                  ? check
                    ? IS_PHONE
                      ? 'Or choose yourself — or swipe the card.'
                      : 'Enter — accept. Or choose yourself: ← / → or swipe the card.'
                    : IS_PHONE
                      ? 'Or swipe the card: right — yes, left — no.'
                      : 'Or swipe the card: right — yes, left — no. Keys: ← / →'
                  : typing
                    ? IS_PHONE
                      ? 'Leave it empty if you don’t remember.'
                      : 'Press Enter to check. Leave it empty if you don’t remember.'
                    : RECALL_TEXT.hint}
              </p>
            </div>
          )}
        </>
      )}

      {current?.kind === 'wait' && limitReached(current.counts) && !practicing.current && (
        <LimitChoice
          counts={current.counts}
          onPractice={practiceCurrent}
          onLearnMore={() => void learnMore(true)}
        />
      )}

      {current?.kind === 'wait' && (!limitReached(current.counts) || practicing.current) && (
        <WaitPanel
          nextDueAt={current.nextDueAt}
          counts={current.counts}
          onLearnMore={() => void learnMore(true)}
          onReady={() => void loadNext()}
          onShowNow={() => void loadNext(true)}
          onFinish={finish}
        />
      )}

      {current?.kind === 'done' && (
        <div className="start-panel">
          <h2>All caught up</h2>
          <p className="muted">You have reviewed everything for now. More reviews will appear later.</p>
          <NewToday counts={current.counts} onLearnMore={() => void learnMore(true)} />
          <button type="button" className="button primary" onClick={finish}>
            End session
          </button>
        </div>
      )}

      {confirmingDelete && current?.kind === 'card' && (
        <Modal
          title="Delete this card?"
          onClose={() => setConfirmingDelete(false)}
          footer={
            <>
              <button type="button" className="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button type="button" className="button danger" onClick={() => void deleteCurrent()}>
                Delete
              </button>
            </>
          }
        >
          <p>
            {/* On the recall front we don't name the word — it would give away the answer. */}
            {back ? `“${back.term}”` : 'This card'} will be deleted together with its progress and review history.
            This cannot be undone.
          </p>
        </Modal>
      )}

      {editing && (
        <CardEditor
          spaceId={spaceId}
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void afterEdit()}
        />
      )}
    </section>
  )
}

/** Session countdown: ticks on its own so the card isn't re-rendered every half second. */
function SessionClock({ timer }: { timer: SessionTimer }) {
  const now = useNow(true)
  const over = isTimeUp(timer, now)
  return (
    <span className={`session-timer${over ? ' over' : ''}`} role="timer" aria-label="Time left">
      {over ? 'Last card' : `⏱ ${formatCountdown(remainingMs(timer, now))}`}
    </span>
  )
}

interface WaitProps {
  nextDueAt: string
  counts: StudyCounts
  onLearnMore: () => void
  onReady: () => void
  onShowNow: () => void
  onFinish: () => void
}

/** Only short reviews are left: you can wait, show now, or finish (SRS-11). */
function WaitPanel({ nextDueAt, counts, onLearnMore, onReady, onShowNow, onFinish }: WaitProps) {
  const target = new Date(nextDueAt).getTime()
  const [remaining, setRemaining] = useState(() => target - Date.now())
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const timer = window.setInterval(() => {
      const left = target - Date.now()
      setRemaining(left)
      if (left <= 0) {
        window.clearInterval(timer)
        onReadyRef.current()
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [target])

  return (
    <div className="start-panel">
      <h2>Next review in {formatCountdown(remaining)}</h2>
      <p className="muted">Some cards are due again shortly. You can wait or finish now.</p>
      <NewToday counts={counts} onLearnMore={onLearnMore} />
      <div className="row">
        <button type="button" className="button" onClick={onShowNow}>
          Show now
        </button>
        <button type="button" className="button primary" onClick={onFinish}>
          End session
        </button>
      </div>
    </div>
  )
}

/**
 * Phone (W4): there is no automatic backup — if there was no full backup for a week, the Study start screen
 * shows a reminder with a button; the backup goes to the Share sheet (Files, iCloud Drive).
 */
function BackupReminder() {
  const [visible, setVisible] = useState(() => backupOverdue())
  const [error, setError] = useState<string | null>(null)
  if (!visible) return null
  const age = backupAge()

  const backUp = async () => {
    setError(null)
    try {
      const result = await call('transfer.backup')
      if (result.saved) {
        markBackedUp()
        setVisible(false)
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="backup-reminder" role="status">
      <span>
        {age ? `Last backup ${age}.` : 'No backup yet.'} Save a copy of your words to Files or iCloud Drive.
      </span>
      <button type="button" className="button" onClick={() => void backUp()}>
        Back up now
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

/** The daily new-word limit is reached, but new words are still waiting (D48). */
const limitReached = (counts: StudyCounts) => counts.newToday.remaining === 0 && counts.newWaiting > 0

interface LimitChoiceProps {
  counts: StudyCounts
  onPractice: () => void
  onLearnMore: () => void
}

/**
 * New words for today ran out mid-session and no reviews are due yet:
 * instead of waiting — two ways forward (D55). The session can be ended with the button in the bar.
 */
function LimitChoice({ counts, onPractice, onLearnMore }: LimitChoiceProps) {
  const { started, limit, extra } = counts.newToday
  return (
    <div className="start-panel limit-choice">
      <h2>{limit + extra === 0 ? 'New words are off' : 'Daily limit of new words reached'}</h2>
      <p className="muted">
        {started} new {plural(started, 'word', 'words')} today · {counts.newWaiting} waiting. What next?
      </p>
      <div className="choice-grid">
        <button type="button" className="choice" onClick={onPractice}>
          <span className="choice-title">Practice current words</span>
          <span className="choice-hint">Repeat the words you’re learning now, without waiting</span>
        </button>
        <button type="button" className="choice" onClick={onLearnMore}>
          <span className="choice-title">Learn 5 new words</span>
          <span className="choice-hint">Raise today’s limit and meet the next words</span>
        </button>
      </div>
    </div>
  )
}

/** How many new words were started today and what to do when the daily limit is reached (MVP-7, D48). */
function NewToday({ counts, onLearnMore }: { counts: StudyCounts; onLearnMore: () => void }) {
  const { started, limit, extra, remaining } = counts.newToday
  if (remaining === 0 && counts.newWaiting > 0) {
    return (
      <p className="new-today limit-reached">
        <span>
          {limit + extra === 0
            ? `New words are off in Settings · ${counts.newWaiting} waiting`
            : `Daily limit reached · ${started} met today, ${counts.newWaiting} waiting`}
        </span>
        <button type="button" className="link-button" onClick={onLearnMore}>
          Learn 5 more today
        </button>
      </p>
    )
  }
  if (limit + extra === 0) return null
  return (
    <p className="new-today">
      {started} of {limit + extra} new words today
    </p>
  )
}
