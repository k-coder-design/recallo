import type { SpaceId } from './types'

/** A pronunciation variant: label, flag and the voice language for speech (D44). */
export interface Accent {
  lang: string
  label: string
  flag: string
}

/** The space's primary variant: the transcription field is built in it, and speech uses it by default. */
export const PRIMARY_ACCENTS: Record<SpaceId, Accent> = {
  en: { lang: 'en-US', label: 'American', flag: '🇺🇸' },
  es: { lang: 'es-AR', label: 'Argentina', flag: '🇦🇷' }
}

/** The second variant (the transcriptionAlt field); null — the space has only one. */
export const ALT_ACCENTS: Record<SpaceId, Accent | null> = {
  en: null,
  es: { lang: 'es-ES', label: 'Spain', flag: '🇪🇸' }
}
