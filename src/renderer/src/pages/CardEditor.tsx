import { useEffect, useState } from 'react'
import type { Card, CardCreateInput, CardSet, CardUpdateInput, DuplicateCard, SpaceId } from '../../../shared/types'
import { ALT_ACCENTS, PRIMARY_ACCENTS } from '../../../shared/accents'
import { containsTerm, findMaskRanges, maskExample } from '../../../shared/masking'
import { EmojiField } from '../components/EmojiField'
import { MaskedText } from '../components/MaskedText'
import { Modal } from '../components/Modal'
import { ApiError, call, errorMessage } from '../lib/api'

interface ExampleDraft {
  text: string
  translation: string
  fragments: string
}

interface Props {
  spaceId: SpaceId
  card: Card | null
  /** The default set for a new card — e.g. the one open in the list right now. */
  defaultSetId?: string | null
  onSaved: (card: Card) => void
  onClose: () => void
  /** Open the found duplicate instead of the current card. */
  onOpenCard?: (cardId: string) => void
}

const FRAGMENT_SEPARATOR = ';'

function toDraft(card: Card | null): ExampleDraft[] {
  if (!card || card.examples.length === 0) return [{ text: '', translation: '', fragments: '' }]
  return card.examples.map((e) => ({
    text: e.text,
    translation: e.translation ?? '',
    fragments: e.maskFragments.join(`${FRAGMENT_SEPARATOR} `)
  }))
}

function parseFragments(value: string): string[] {
  return value
    .split(FRAGMENT_SEPARATOR)
    .map((f) => f.trim())
    .filter(Boolean)
}

export function CardEditor({ spaceId, card, defaultSetId = null, onSaved, onClose, onOpenCard }: Props) {
  const [term, setTerm] = useState(card?.term ?? '')
  const [setId, setSetId] = useState<string | null>(card ? card.setId : defaultSetId)
  const [sets, setSets] = useState<CardSet[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateCard[]>([])
  const [transcription, setTranscription] = useState(card?.transcription ?? '')
  const [transcriptionTouched, setTranscriptionTouched] = useState(false)
  const [transcriptionAlt, setTranscriptionAlt] = useState(card?.transcriptionAlt ?? '')
  const [transcriptionAltTouched, setTranscriptionAltTouched] = useState(false)
  const altAccent = ALT_ACCENTS[spaceId]
  const [meaning, setMeaning] = useState(card?.meaning ?? '')
  const [emoji, setEmoji] = useState<string | null>(card?.emoji ?? null)
  const [emojiTouched, setEmojiTouched] = useState(false)
  const emojiAuto = !emojiTouched && (card === null || card.emojiAuto)
  const [examples, setExamples] = useState<ExampleDraft[]>(() => toDraft(card))
  const [resetProgress, setResetProgress] = useState(false)

  useEffect(() => {
    call('sets.list', spaceId)
      .then(setSets)
      .catch(() => setSets([]))
  }, [spaceId])

  // Duplicate warning: the same card must not quietly appear twice.
  useEffect(() => {
    if (!term.trim()) return setDuplicates([])
    const timer = window.setTimeout(() => {
      call('cards.findDuplicates', spaceId, term, card?.id)
        .then(setDuplicates)
        .catch(() => setDuplicates([]))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [spaceId, term, card?.id])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Until the transcription is edited manually, it follows the word (D22).
  const termChanged = card === null || term.trim() !== card.term
  const followsTerm = !transcriptionTouched && (termChanged || card.transcription === null)
  const altFollowsTerm = altAccent !== null && !transcriptionAltTouched && (termChanged || card.transcriptionAlt === null)
  useEffect(() => {
    if (!followsTerm && !altFollowsTerm) return
    const timer = window.setTimeout(() => {
      call('cards.suggestTranscription', spaceId, term)
        .then((suggestion) => {
          if (followsTerm) setTranscription(suggestion.transcription ?? '')
          if (altFollowsTerm) setTranscriptionAlt(suggestion.transcriptionAlt ?? '')
        })
        .catch(() => {
          if (followsTerm) setTranscription('')
          if (altFollowsTerm) setTranscriptionAlt('')
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [followsTerm, altFollowsTerm, spaceId, term])

  const contentChanged = card !== null && (term.trim() !== card.term || meaning.trim() !== card.meaning)
  const meaningLeaksAnswer = term.trim() !== '' && containsTerm(meaning, term, spaceId)

  const updateExample = (index: number, patch: Partial<ExampleDraft>) =>
    setExamples((list) => list.map((e, i) => (i === index ? { ...e, ...patch } : e)))

  const save = async () => {
    setSaving(true)
    setError(null)
    const payload = examples
      .filter((e) => e.text.trim() !== '')
      .map((e) => ({ text: e.text, translation: e.translation, maskFragments: parseFragments(e.fragments) }))
    try {
      const saved = card
        ? await call('cards.update', card.id, {
            version: card.version,
            setId,
            term,
            transcription,
            ...(altAccent ? { transcriptionAlt } : {}),
            ...(emojiTouched ? { emoji } : {}),
            meaning,
            examples: payload,
            resetProgress
          } satisfies CardUpdateInput)
        : await call('cards.create', {
            spaceId,
            setId,
            term,
            transcription,
            ...(altAccent ? { transcriptionAlt } : {}),
            ...(emojiTouched ? { emoji } : {}),
            meaning,
            examples: payload
          } satisfies CardCreateInput)
      onSaved(saved)
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'CONFLICT' ? e.message : errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={card ? 'Edit card' : 'New card'}
      onClose={onClose}
      size="large"
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span>Word or phrase</span>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. go the extra mile" autoFocus />
          {duplicates.length > 0 && (
            <div className="duplicate-warning" role="alert">
              <span>
                {duplicates.length === 1 ? 'This word already exists:' : 'This word already exists in several cards:'}
              </span>
              <ul>
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <strong>{d.term}</strong> — {d.meaning}
                    {d.setName && <span className="muted"> · {d.setName}</span>}
                    {onOpenCard && (
                      <button type="button" className="link-button" onClick={() => onOpenCard(d.id)}>
                        Open
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <small className="muted">You can still save — this is just a heads-up.</small>
            </div>
          )}
        </label>

        <label className="field">
          <span>Set</span>
          <select value={setId ?? ''} onChange={(e) => setSetId(e.target.value || null)}>
            <option value="">No set</option>
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>
            Transcription <small className="muted">— filled in automatically, you can edit it</small>
          </span>
          <TranscriptionInput
            label={altAccent ? `${PRIMARY_ACCENTS[spaceId].flag} ${PRIMARY_ACCENTS[spaceId].label}` : null}
            value={transcription}
            empty={!term.trim()}
            onChange={(value) => {
              setTranscriptionTouched(true)
              setTranscription(value)
            }}
          />
          {altAccent && (
            <TranscriptionInput
              label={`${altAccent.flag} ${altAccent.label}`}
              value={transcriptionAlt}
              empty={!term.trim()}
              onChange={(value) => {
                setTranscriptionAltTouched(true)
                setTranscriptionAlt(value)
              }}
            />
          )}
        </div>

        <label className="field">
          <span>Meaning</span>
          <textarea
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="Translation or definition — in any language"
            rows={2}
          />
          {meaningLeaksAnswer && (
            <small className="warning">The meaning contains the expression itself and gives the answer away. Consider rephrasing it.</small>
          )}
        </label>

        <EmojiField
          spaceId={spaceId}
          term={term}
          meaning={meaning}
          value={emoji}
          auto={emojiAuto}
          onChange={(value) => {
            setEmojiTouched(true)
            setEmoji(value)
          }}
        />

        <fieldset className="examples">
          <legend>Usage examples</legend>
          {examples.map((example, index) => {
            const fragments = parseFragments(example.fragments)
            const hasText = example.text.trim() !== '' && term.trim() !== ''
            const found = hasText && findMaskRanges(example.text, term, fragments, spaceId).length > 0
            return (
              <div className="example" key={index}>
                <div className="example-header">
                  <strong>Example {index + 1}</strong>
                  {examples.length > 1 && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setExamples((list) => list.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  value={example.text}
                  onChange={(e) => updateExample(index, { text: e.target.value })}
                  placeholder="A sentence that uses the word"
                  rows={2}
                />
                <input
                  value={example.translation}
                  onChange={(e) => updateExample(index, { translation: e.target.value })}
                  placeholder="Example translation (optional)"
                />
                <input
                  value={example.fragments}
                  onChange={(e) => updateExample(index, { fragments: e.target.value })}
                  placeholder="Other forms to hide, separated by ';' — e.g. 'm used to; was used to"
                />
                {hasText && (
                  <div className={`preview ${found ? '' : 'warning-box'}`}>
                    {found ? (
                      <>
                        <span className="muted small">On the card: </span>
                        <MaskedText segments={maskExample(example.text, term, fragments, spaceId)} mode="hide" />
                      </>
                    ) : (
                      <span className="warning">
                        The expression was not found in this example. Specify which fragment to hide, otherwise the answer will be visible.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="button ghost"
            onClick={() => setExamples((list) => [...list, { text: '', translation: '', fragments: '' }])}
          >
            + Add example
          </button>
        </fieldset>

        {card && (
          <label className={`checkbox ${contentChanged ? 'highlight' : ''}`}>
            <input type="checkbox" checked={resetProgress} onChange={(e) => setResetProgress(e.target.checked)} />
            <span>
              Reset progress
              <small className="muted">
                {contentChanged
                  ? ' — the word or meaning changed; reset if this is essentially a new card'
                  : ' — the card will be learned from scratch'}
              </small>
            </span>
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

interface TranscriptionInputProps {
  /** A pronunciation label (flag and region); null — there is only one variant. */
  label: string | null
  value: string
  empty: boolean
  onChange: (value: string) => void
}

function TranscriptionInput({ label, value, empty, onChange }: TranscriptionInputProps) {
  return (
    <label className="transcription-input">
      {label && <span className="accent-label">{label}</span>}
      <span aria-hidden="true">/</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label ? `Transcription, ${label}` : 'Transcription'}
        placeholder={empty ? 'Fills in automatically from the word' : 'Not found in the dictionary — type it here'}
      />
      <span aria-hidden="true">/</span>
    </label>
  )
}
