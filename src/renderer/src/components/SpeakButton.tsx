import { useState } from 'react'
import { canSpeak, chooseVoice, speak, useVoices } from '../lib/tts'

interface Props {
  text: string
  lang: string
  /** Только иконка — для минималистичной стороны со словом. */
  compact?: boolean
}

export function SpeakButton({ text, lang, compact = false }: Props) {
  const [failed, setFailed] = useState(false)
  const voices = useVoices()
  if (!canSpeak()) return compact ? null : <span className="muted small">Speech is unavailable</span>

  // В подсказке видно, каким голосом прозвучит слово и что голоса нужного региона нет.
  const { voice, exact } = chooseVoice(lang, voices)
  const title = failed
    ? 'Speech failed'
    : voice
      ? `Listen — ${voice.name}${exact ? '' : ` (no ${lang} voice installed, see Settings → Voices)`}`
      : 'Listen to pronunciation'

  return (
    <button
      type="button"
      className={compact ? 'speak-icon' : 'button ghost'}
      onClick={() => setFailed(!speak(text, lang))}
      // На карточке Study у значка подсказки нет; у кнопки «Listen» в редакторе title показывает голос.
      title={compact ? undefined : title}
      aria-label={`Listen to pronunciation (${lang})`}
    >
      🔊{!compact && ' Listen'}
      {failed && !compact && <span className="muted small"> — failed</span>}
    </button>
  )
}
