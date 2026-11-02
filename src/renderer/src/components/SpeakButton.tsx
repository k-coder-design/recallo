import { useState } from 'react'
import { canSpeak, chooseVoice, speak, useVoices } from '../lib/tts'

interface Props {
  text: string
  lang: string
  /** Icon only — for the minimal word side. */
  compact?: boolean
}

export function SpeakButton({ text, lang, compact = false }: Props) {
  const [failed, setFailed] = useState(false)
  const voices = useVoices()
  if (!canSpeak()) return compact ? null : <span className="muted small">Speech is unavailable</span>

  // The tooltip shows which voice will speak the word and that the exact regional voice is missing.
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
      // On the Study card the icon has no tooltip; the "Listen" button in the editor shows the voice in its title.
      title={compact ? undefined : title}
      aria-label={`Listen to pronunciation (${lang})`}
    >
      🔊{!compact && ' Listen'}
      {failed && !compact && <span className="muted small"> — failed</span>}
    </button>
  )
}
