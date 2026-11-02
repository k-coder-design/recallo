import { useEffect, useState } from 'react'

/** Small interface settings (e.g. the chosen language) — in localStorage. */
export function usePersistentState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Storage is unavailable — the setting simply will not be remembered.
    }
  }, [key, value])

  return [value, setValue] as const
}
