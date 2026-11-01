import type { SpaceId } from './types'

/** Вариант произношения: подпись, флаг и язык голоса для озвучки (D44). */
export interface Accent {
  lang: string
  label: string
  flag: string
}

/** Основной вариант пространства: в нём строится поле transcription и звучит озвучка по умолчанию. */
export const PRIMARY_ACCENTS: Record<SpaceId, Accent> = {
  en: { lang: 'en-US', label: 'American', flag: '🇺🇸' },
  es: { lang: 'es-AR', label: 'Argentina', flag: '🇦🇷' }
}

/** Второй вариант (поле transcriptionAlt); null — у пространства он один. */
export const ALT_ACCENTS: Record<SpaceId, Accent | null> = {
  en: null,
  es: { lang: 'es-ES', label: 'Spain', flag: '🇪🇸' }
}
