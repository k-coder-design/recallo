import type { BridgeApi } from '../../shared/api'

declare global {
  /** Interface build: 'mac' or 'phone' (lib/platform.ts). */
  const __RECALLO_PLATFORM__: 'mac' | 'phone' | undefined

  interface Window {
    recallo: BridgeApi
  }
}

export {}
