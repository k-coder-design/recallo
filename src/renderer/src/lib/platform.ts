/**
 * Which build the interface is for: 'mac' — the Electron app, 'phone' — Recallo: Mobile for iPhone (D57).
 * The value is set at build time (define in electron.vite.config.ts and vite.mobile.config.ts);
 * without it (e.g. in tests) — 'mac'.
 */
export const PLATFORM: 'mac' | 'phone' = typeof __RECALLO_PLATFORM__ === 'string' ? __RECALLO_PLATFORM__ : 'mac'

/** On iPhone there is no MCP or Agent API, no automatic backup to a folder or Finder — such settings are not shown (D59). */
export const IS_PHONE = PLATFORM === 'phone'
