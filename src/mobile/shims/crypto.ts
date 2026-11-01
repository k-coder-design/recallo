/**
 * node:crypto для телефонной сборки (D57): ядру нужны только randomUUID (id записей)
 * и randomBytes(...).toString('base64url') (токен API агента). В браузере — Web Crypto.
 */
export function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}

export function randomBytes(size: number): { toString(encoding: 'base64url' | 'hex'): string } {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(size))
  return {
    toString(encoding) {
      if (encoding === 'hex') return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
  }
}
