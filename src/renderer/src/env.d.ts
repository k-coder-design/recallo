import type { BridgeApi } from '../../shared/api'

declare global {
  /** Сборка интерфейса: 'mac' или 'phone' (lib/platform.ts). */
  const __RECALLO_PLATFORM__: 'mac' | 'phone' | undefined

  interface Window {
    recallo: BridgeApi
  }
}

export {}
