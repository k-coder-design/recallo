import type { Theme } from '../../../shared/types'

/**
 * The appearance theme in the page itself (D49, D58): the data-theme="light|dark" attribute on <html>,
 * which the dark colors in styles.css depend on. With "System" the theme follows the system and changes with it.
 * On the Mac Electron also switches the window's system theme (nativeTheme), but in the phone's browser
 * that is impossible — so the page decides, the same way in both builds.
 */
const CACHE_KEY = 'theme'
const THEMES: readonly Theme[] = ['system', 'light', 'dark']
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
let current: Theme = 'system'

function render(): void {
  const dark = current === 'dark' || (current === 'system' && systemDark.matches)
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
  // Phone: the status bar takes the header color, also when Light or Dark is chosen against the system.
  const headerColor = getComputedStyle(document.documentElement).getPropertyValue('--deep').trim()
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (headerColor) meta.content = headerColor
  })
}

systemDark.addEventListener('change', render)

export function applyTheme(theme: Theme): void {
  current = theme
  render()
  try {
    // A copy of the choice in localStorage — so the theme is right from the first frame on the next launch,
    // before the core answers. The source of truth is the setting in the database.
    window.localStorage.setItem(CACHE_KEY, theme)
  } catch {
    // Storage is unavailable — the theme is applied anyway.
  }
}

/** The theme at startup: the last known choice, until the core answers. */
export function applyCachedTheme(): void {
  let cached: string | null = null
  try {
    cached = window.localStorage.getItem(CACHE_KEY)
  } catch {
    // No storage — follow the system.
  }
  current = cached && (THEMES as readonly string[]).includes(cached) ? (cached as Theme) : 'system'
  render()
}
