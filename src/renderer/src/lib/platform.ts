/**
 * Для какой сборки интерфейс: 'mac' — приложение Electron, 'phone' — Recallo: Mobile для iPhone (D57).
 * Значение подставляется при сборке (define в electron.vite.config.ts и vite.mobile.config.ts);
 * без него (например, в тестах) — 'mac'.
 */
export const PLATFORM: 'mac' | 'phone' = typeof __RECALLO_PLATFORM__ === 'string' ? __RECALLO_PLATFORM__ : 'mac'

/** На iPhone нет MCP и Agent API, автокопии в папку и Finder — такие настройки не показываются (D59). */
export const IS_PHONE = PLATFORM === 'phone'
