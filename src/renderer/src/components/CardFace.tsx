import { useMemo, type ReactNode } from 'react'
import type { CardBack, CardFront, Pronunciation, StudyMode } from '../../../shared/types'
import { MaskedText } from './MaskedText'
import { SpeakButton } from './SpeakButton'
import { chooseVoice, playableLangs, useVoices, voiceRegion } from '../lib/tts'

/** A labelled block on the back: so it is clear where the meaning is and where the examples are. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="face-section">
      <h3 className="section-label">{label}</h3>
      {children}
    </section>
  )
}

/** Pronunciations: transcription and speech; with several variants — with a region flag (D44). */
function Pronunciations({ term, list }: { term: string; list: Pronunciation[] }) {
  const several = list.length > 1
  const voices = useVoices()
  // Choosing a voice sorts all system voices — compute it only when the variants or voices change.
  const langs = list.map((p) => p.lang).join(' ')
  const playable = useMemo(() => playableLangs(langs.split(' '), voices), [langs, voices])
  // A stand-in voice from another region is named next to the button: "Mexican voice" (D61).
  const standIns = useMemo(() => {
    const names = new Map<string, string>()
    for (const lang of langs.split(' ')) {
      const choice = chooseVoice(lang, voices)
      const region = choice.near ? voiceRegion(choice.voice) : null
      if (region) names.set(lang, region)
    }
    return names
  }, [langs, voices])
  return (
    <div className={`pronunciations${several ? ' several' : ''}`}>
      {list.map((p) => (
        <div key={p.lang} className="term-meta pronunciation">
          {several && (
            <span className="accent-flag" title={p.label} aria-label={p.label}>
              {p.flag}
            </span>
          )}
          {p.transcription && <span className="transcription">/{p.transcription}/</span>}
          {playable.has(p.lang) && <SpeakButton text={term} lang={p.lang} compact />}
          {playable.has(p.lang) && standIns.has(p.lang) && <span className="voice-standin">{standIns.get(p.lang)} voice</span>}
        </div>
      ))}
    </div>
  )
}

/** The card's hero image: the same emoji on both sides (D31). */
function HeroEmoji({ emoji }: { emoji: string | null }) {
  if (!emoji) return null
  return (
    <div className="face-hero" aria-hidden="true">
      <span>{emoji}</span>
    </div>
  )
}

/** The trash can in the corner next to the pencil: delete the card without leaving the session (with confirmation). */
export function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="card-edit card-delete" onClick={onClick} data-tooltip="Delete card" aria-label="Delete card">
      🗑
    </button>
  )
}

/** The pencil in the corner: edit the card without leaving the session. */
export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="card-edit" onClick={onClick} data-tooltip="Edit card" aria-label="Edit card">
      ✎
    </button>
  )
}

/** Recall, front side: the meaning and examples with a gap; the word has to be recalled. */
export function RecallFrontFace({ front }: { front: CardFront }) {
  return (
    <div className="card-face">
      <HeroEmoji emoji={front.emoji} />
      <p className="eyebrow">What’s the word?</p>
      <Section label="Meaning">
        <p className="meaning-text">{front.meaning}</p>
      </Section>
      {front.examples.length > 0 && (
        <Section label={front.examples.length > 1 ? 'Examples' : 'Example'}>
          <ul className="example-list">
            {front.examples.map((segments, i) => (
              <li key={i} className="example-quote">
                <MaskedText segments={segments} mode="hide" />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/** The back in both modes: the word with transcription and speech, the meaning, full examples. */
export function BackFace({ back, mode }: { back: CardBack; mode: StudyMode }) {
  return (
    <div className="card-face back-face">
      <HeroEmoji emoji={back.emoji} />
      <div className="answer-head">
        {mode === 'intro' ? (
          // First meeting with a word: a label so it is not confused with a check (D53).
          <p className="new-word-badge">
            <span aria-hidden="true">✨</span> New word · first meeting
          </p>
        ) : (
          <p className="eyebrow">Answer</p>
        )}
        <h2 className="term-big">{back.term}</h2>
        <Pronunciations term={back.term} list={back.pronunciations} />
      </div>
      <Section label="Meaning">
        <p className="meaning-text">{back.meaning}</p>
      </Section>
      {back.examples.length > 0 && (
        <Section label={back.examples.length > 1 ? 'Examples' : 'Example'}>
          <ul className="example-list">
            {back.examples.map((example, i) => (
              <li key={i} className="example-quote">
                <MaskedText segments={example.segments} mode="reveal" />
                {example.translation && <div className="translation">{example.translation}</div>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
