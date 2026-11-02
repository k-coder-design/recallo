import { useEffect, useState } from 'react'
import { toSpeechText } from '../../../shared/speech'

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** macOS novelty voices (robots, bells) — not suitable for words. */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph)\b/
/** Eloquence synthetic voices: intelligible but mechanical — only if there are no others. */
const ELOQUENCE = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/

/**
 * Nearest regions when the exact voice is missing (D44): for Argentine, other Latin American ones first
 * (seseo, without the Castilian [θ]), and only then any Spanish.
 */
const FALLBACKS: Record<string, string[]> = {
  'es-AR': ['es-UY', 'es-419', 'es-US', 'es-MX', 'es-CO', 'es-CL']
}

export interface VoiceChoice {
  voice: SpeechSynthesisVoice | null
  /** true — a voice of exactly this region; false — the nearest available. */
  exact: boolean
}

/** Language codes as one form: iOS and macOS may report "es_AR", "es-ar" or "es-AR" for the same voice. */
export const normalizeLang = (lang: string) => lang.replace(/_/g, '-').toLowerCase()
const rank = (voice: SpeechSynthesisVoice) => (NOVELTY.test(voice.name) ? 2 : ELOQUENCE.test(voice.name) ? 1 : 0)
/** macOS voice quality: Premium and Enhanced sound noticeably more natural (Diego (Enhanced) before Diego). */
const quality = (voice: SpeechSynthesisVoice) => (/\(Premium\)/.test(voice.name) ? 0 : /\(Enhanced\)/.test(voice.name) ? 1 : 2)

export function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    [...voices].sort(
      (a, b) => rank(a) - rank(b) || quality(a) - quality(b) || Number(b.localService) - Number(a.localService)
    )[0] ?? null
  )
}

const best = bestVoice

/** A voice for a language: the exact region, then nearby regions, then any voice of the language. */
export function chooseVoice(lang: string, voices: SpeechSynthesisVoice[]): VoiceChoice {
  const ofLang = (code: string) => voices.filter((v) => normalizeLang(v.lang) === normalizeLang(code))
  const exact = best(ofLang(lang))
  if (exact) return { voice: exact, exact: true }
  for (const code of FALLBACKS[lang] ?? []) {
    const near = best(ofLang(code))
    if (near) return { voice: near, exact: false }
  }
  const prefix = normalizeLang(lang).split('-')[0] ?? lang
  return { voice: best(voices.filter((v) => normalizeLang(v.lang).split('-')[0] === prefix)), exact: false }
}

/**
 * Which pronunciations to speak (D47): if there are several, only those that have
 * a voice of exactly their region installed — a foreign voice sounds the same for every variant.
 * If there are none, the primary variant is spoken with the nearest voice. A single variant is always spoken.
 */
export function playableLangs(langs: string[], voices: SpeechSynthesisVoice[]): Set<string> {
  if (langs.length <= 1) return new Set(langs)
  const exact = langs.filter((lang) => chooseVoice(lang, voices).exact)
  return new Set(exact.length > 0 ? exact : langs.slice(0, 1))
}

/** The system voice list: in Chromium it arrives asynchronously (voiceschanged). */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (canSpeak() ? window.speechSynthesis.getVoices() : []))
  useEffect(() => {
    if (!canSpeak()) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    // Voices installed while Recallo is open: re-read the list when returning to the window
    // (focus on the Mac, visibility on the iPhone, where a Home Screen app gets no focus event).
    const onVisible = () => document.visibilityState === 'visible' && update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', onVisible)
    // iOS may hand over the voice list late and without a voiceschanged event: ask again a few times.
    const retries = [300, 1000, 3000].map((ms) => window.setTimeout(update, ms))
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', update)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', onVisible)
      retries.forEach((id) => window.clearTimeout(id))
    }
  }, [])
  return voices
}

/**
 * Speaks text with the system voice of the chosen pronunciation (LANG-06, D44).
 * Returns false if speech synthesis is unavailable — studying is not blocked by it (GEN-04).
 */
export function speak(text: string, lang: string): boolean {
  if (!canSpeak()) return false
  const synth = window.speechSynthesis
  synth.cancel()

  const { voice } = chooseVoice(lang, synth.getVoices())
  const utterance = new SpeechSynthesisUtterance(toSpeechText(text, lang))
  utterance.lang = voice?.lang ?? lang
  utterance.voice = voice
  utterance.rate = 0.9
  synth.speak(utterance)
  return true
}
