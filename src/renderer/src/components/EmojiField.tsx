import { useEffect, useState } from 'react'
import type { EmojiSuggestions, SpaceId } from '../../../shared/types'
import { call } from '../lib/api'

interface Props {
  spaceId: SpaceId
  term: string
  meaning: string
  /** The emoji chosen by the user (null — no emoji); ignored while auto = true. */
  value: string | null
  /** Until the user chooses, the emoji is picked automatically from the word and meaning (D27). */
  auto: boolean
  onChange: (emoji: string | null) => void
}

export function EmojiField({ spaceId, term, meaning, value, auto, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<EmojiSuggestions>({ best: null, options: [] })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      call('cards.suggestEmojis', spaceId, term, meaning)
        .then(setSuggestions)
        .catch(() => setSuggestions({ best: null, options: [] }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [spaceId, term, meaning])

  useEffect(() => {
    if (!query.trim()) return setResults([])
    const timer = window.setTimeout(() => {
      call('emoji.search', query)
        .then(setResults)
        .catch(() => setResults([]))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const current = auto ? suggestions.best : value
  const choices = query.trim() ? results : suggestions.options

  return (
    <div className="field">
      <span>
        Association <small className="muted">— an emoji that helps you remember the word</small>
      </span>
      <div className="emoji-field">
        <div className="emoji-current" aria-label={current ? `Current emoji ${current}` : 'No emoji'}>
          {current ?? '—'}
        </div>
        <div className="emoji-controls">
          <p className="muted small">
            {auto
              ? current
                ? 'Picked automatically. Choose another one if it doesn’t fit.'
                : 'Nothing fits automatically. Pick one or search below.'
              : current
                ? 'Your choice.'
                : 'No emoji on this card.'}
          </p>
          <div className="emoji-options" role="listbox" aria-label="Emoji options">
            {choices.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="option"
                aria-selected={emoji === current}
                className={`emoji-option ${emoji === current ? 'selected' : ''}`}
                onClick={() => onChange(emoji)}
              >
                {emoji}
              </button>
            ))}
            {choices.length === 0 && query.trim() && <span className="muted small">Nothing found</span>}
          </div>
          <div className="emoji-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: rain, cat, corazón…"
              aria-label="Search emoji"
            />
            <button type="button" className="button" onClick={() => onChange(null)} disabled={!auto && current === null}>
              No emoji
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
