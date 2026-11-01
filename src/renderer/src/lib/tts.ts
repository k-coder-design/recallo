import { useEffect, useState } from 'react'
import { toSpeechText } from '../../../shared/speech'

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Голоса-эффекты macOS (роботы, колокольчики) — для слов не подходят. */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph)\b/
/** Синтетические голоса Eloquence: понятные, но звучат механически — только если нет других. */
const ELOQUENCE = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/

/**
 * Ближайшие регионы, если голоса нужного нет (D44): для аргентинского сначала другие латиноамериканские
 * (seseo, без кастильского [θ]), и только потом любой испанский.
 */
const FALLBACKS: Record<string, string[]> = {
  'es-AR': ['es-UY', 'es-419', 'es-US', 'es-MX', 'es-CO', 'es-CL']
}

export interface VoiceChoice {
  voice: SpeechSynthesisVoice | null
  /** true — голос именно этого региона; false — ближайший доступный. */
  exact: boolean
}

const normalizeLang = (lang: string) => lang.replace('_', '-')
const rank = (voice: SpeechSynthesisVoice) => (NOVELTY.test(voice.name) ? 2 : ELOQUENCE.test(voice.name) ? 1 : 0)
/** Качество голоса macOS: Premium и Enhanced звучат заметно естественнее обычных (Diego (Enhanced) раньше Diego). */
const quality = (voice: SpeechSynthesisVoice) => (/\(Premium\)/.test(voice.name) ? 0 : /\(Enhanced\)/.test(voice.name) ? 1 : 2)

export function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    [...voices].sort(
      (a, b) => rank(a) - rank(b) || quality(a) - quality(b) || Number(b.localService) - Number(a.localService)
    )[0] ?? null
  )
}

const best = bestVoice

/** Голос для языка: точный регион, затем близкие регионы, затем любой голос языка. */
export function chooseVoice(lang: string, voices: SpeechSynthesisVoice[]): VoiceChoice {
  const ofLang = (code: string) => voices.filter((v) => normalizeLang(v.lang) === code)
  const exact = best(ofLang(lang))
  if (exact) return { voice: exact, exact: true }
  for (const code of FALLBACKS[lang] ?? []) {
    const near = best(ofLang(code))
    if (near) return { voice: near, exact: false }
  }
  const prefix = lang.split('-')[0] ?? lang
  return { voice: best(voices.filter((v) => normalizeLang(v.lang).split('-')[0] === prefix)), exact: false }
}

/**
 * Какие варианты произношения озвучивать (D47): если вариантов несколько, только те, для которых
 * установлен голос именно этого региона — чужой голос звучит одинаково для всех вариантов.
 * Если таких нет, озвучивается основной вариант ближайшим голосом. Единственный вариант озвучивается всегда.
 */
export function playableLangs(langs: string[], voices: SpeechSynthesisVoice[]): Set<string> {
  if (langs.length <= 1) return new Set(langs)
  const exact = langs.filter((lang) => chooseVoice(lang, voices).exact)
  return new Set(exact.length > 0 ? exact : langs.slice(0, 1))
}

/** Список голосов системы: в Chromium он приходит асинхронно (voiceschanged). */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (canSpeak() ? window.speechSynthesis.getVoices() : []))
  useEffect(() => {
    if (!canSpeak()) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    // Голоса, установленные в macOS при открытом Recallo: перечитываем список при возврате в окно.
    window.addEventListener('focus', update)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', update)
      window.removeEventListener('focus', update)
    }
  }, [])
  return voices
}

/**
 * Озвучивает текст системным голосом выбранного варианта произношения (LANG-06, D44).
 * Возвращает false, если синтез речи недоступен — обучение при этом не блокируется (GEN-04).
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
