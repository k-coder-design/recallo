import { useEffect, useState } from 'react'

/** Небольшие настройки интерфейса (например, выбранный язык) — в localStorage. */
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
      // Хранилище недоступно — настройка просто не запомнится.
    }
  }, [key, value])

  return [value, setValue] as const
}
