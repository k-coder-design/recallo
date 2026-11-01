/**
 * Напоминание о полной копии на телефоне (W4): автокопии там нет, и удаление Recallo с экрана «Домой»
 * удаляет данные. Время последней копии — в localStorage этого устройства: если оно пропадёт,
 * худшее, что случится, — лишнее напоминание.
 */
const KEY = 'lastBackupAt'
/** Через сколько дней без копии напоминать. */
export const BACKUP_REMIND_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export function lastBackupAt(): Date | null {
  try {
    const stored = window.localStorage.getItem(KEY)
    const date = stored ? new Date(stored) : null
    return date && !Number.isNaN(date.getTime()) ? date : null
  } catch {
    return null
  }
}

export function markBackedUp(): void {
  try {
    window.localStorage.setItem(KEY, new Date().toISOString())
  } catch {
    // Хранилище недоступно — просто напомним ещё раз.
  }
}

/** Копии не было или она старше BACKUP_REMIND_DAYS дней. */
export function backupOverdue(now = Date.now()): boolean {
  const last = lastBackupAt()
  return !last || now - last.getTime() > BACKUP_REMIND_DAYS * DAY_MS
}

/** «today», «yesterday», «9 days ago» — для напоминания и Settings. */
export function backupAge(now = Date.now()): string | null {
  const last = lastBackupAt()
  if (!last) return null
  const days = Math.floor((now - last.getTime()) / DAY_MS)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
