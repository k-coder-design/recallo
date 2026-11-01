import type { Theme } from '../../../shared/types'

/**
 * Тема оформления в самой странице (D49, D58): атрибут data-theme="light|dark" на <html>,
 * от него зависят тёмные цвета в styles.css. При «System» тема следует за системой и меняется вместе с ней.
 * На Mac Electron ещё и переключает системную тему окна (nativeTheme), а в браузере телефона
 * так нельзя — поэтому решение принимает страница, одинаково в обеих сборках.
 */
const CACHE_KEY = 'theme'
const THEMES: readonly Theme[] = ['system', 'light', 'dark']
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
let current: Theme = 'system'

function render(): void {
  const dark = current === 'dark' || (current === 'system' && systemDark.matches)
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
}

systemDark.addEventListener('change', render)

export function applyTheme(theme: Theme): void {
  current = theme
  render()
  try {
    // Копия выбора в localStorage — чтобы при следующем запуске тема была верной с первого кадра,
    // ещё до ответа ядра. Источник истины — настройка в базе.
    window.localStorage.setItem(CACHE_KEY, theme)
  } catch {
    // Хранилище недоступно — тема всё равно применена.
  }
}

/** Тема при запуске: последний известный выбор, пока ядро не ответило. */
export function applyCachedTheme(): void {
  let cached: string | null = null
  try {
    cached = window.localStorage.getItem(CACHE_KEY)
  } catch {
    // Нет хранилища — как в системе.
  }
  current = cached && (THEMES as readonly string[]).includes(cached) ? (cached as Theme) : 'system'
  render()
}
