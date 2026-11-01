import { useEffect, useRef, useState } from 'react'
import type { AnswerCheck } from '../../../shared/answerCheck'

/** Поле ответа при вспоминании в режиме ввода (MVP-8). Пустой ответ — «не помню». */
export function AnswerInput({ onSubmit }: { onSubmit: (answer: string) => void }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  return (
    <form
      className="answer-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(value)
      }}
    >
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type the word…"
        aria-label="Your answer"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <button type="submit" className="button primary">
        Check
      </button>
    </form>
  )
}

const VERDICT_TEXT: Record<AnswerCheck['verdict'], { icon: string; title: string }> = {
  correct: { icon: '✓', title: 'Correct' },
  almost: { icon: '≈', title: 'Almost — check the spelling' },
  wrong: { icon: '✗', title: 'Not quite' },
  empty: { icon: '·', title: 'No answer' }
}

/** Вердикт приложения и введённый ответ с подсвеченной разницей; оценку выбирает пользователь. */
export function VerdictPanel({ check }: { check: AnswerCheck }) {
  const text = VERDICT_TEXT[check.verdict]
  return (
    <div className={`verdict verdict-${check.verdict}`} role="status">
      <p className="verdict-title">
        <span aria-hidden="true">{text.icon}</span> {text.title}
      </p>
      {check.typed && check.verdict !== 'correct' && (
        <p className="verdict-typed">
          You typed:{' '}
          <span className="diff">
            {check.diff.map((part, i) => (
              <span key={i} className={`diff-${part.kind}`}>
                {part.text}
              </span>
            ))}
          </span>
        </p>
      )}
    </div>
  )
}
