import { useMemo, type ReactNode } from 'react'
import type { CardBack, CardFront, Pronunciation, StudyMode } from '../../../shared/types'
import { MaskedText } from './MaskedText'
import { SpeakButton } from './SpeakButton'
import { playableLangs, useVoices } from '../lib/tts'

/** Подписанный блок оборота: чтобы было видно, где значение, а где примеры. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="face-section">
      <h3 className="section-label">{label}</h3>
      {children}
    </section>
  )
}

/** Варианты произношения: транскрипция и озвучка; если вариантов несколько — с флагом региона (D44). */
function Pronunciations({ term, list }: { term: string; list: Pronunciation[] }) {
  const several = list.length > 1
  const voices = useVoices()
  // Выбор голоса сортирует все голоса системы — считаем его, только когда меняются варианты или голоса.
  const langs = list.map((p) => p.lang).join(' ')
  const playable = useMemo(() => playableLangs(langs.split(' '), voices), [langs, voices])
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
        </div>
      ))}
    </div>
  )
}

/** Заглавная картинка карточки: одно и то же эмодзи на обеих сторонах (D31). */
function HeroEmoji({ emoji }: { emoji: string | null }) {
  if (!emoji) return null
  return (
    <div className="face-hero" aria-hidden="true">
      <span>{emoji}</span>
    </div>
  )
}

/** Корзина в углу рядом с карандашом: удалить карточку, не выходя из сессии (с подтверждением). */
export function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="card-edit card-delete" onClick={onClick} data-tooltip="Delete card" aria-label="Delete card">
      🗑
    </button>
  )
}

/** Карандаш в углу: поправить карточку, не выходя из сессии. */
export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="card-edit" onClick={onClick} data-tooltip="Edit card" aria-label="Edit card">
      ✎
    </button>
  )
}

/** Вспоминание, лицевая сторона: значение и примеры с пропуском, слово надо вспомнить. */
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

/** Оборот в обоих режимах: слово с транскрипцией и озвучкой, значение, полные примеры. */
export function BackFace({ back, mode }: { back: CardBack; mode: StudyMode }) {
  return (
    <div className="card-face back-face">
      <HeroEmoji emoji={back.emoji} />
      <div className="answer-head">
        {mode === 'intro' ? (
          // Первая встреча со словом: ярлык, чтобы не путать с проверкой (D53).
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
