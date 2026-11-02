/**
 * node:crypto for the phone build (D57): the core needs only randomUUID (record ids)
 * and randomBytes(...).toString('base64url') (the agent API token). In the browser — Web Crypto.
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
