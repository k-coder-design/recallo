/**
 * Full-backup reminder on the phone (W4): there is no automatic backup there, and removing Recallo from the Home Screen
 * deletes the data. The last backup time is in this device's localStorage: if it is lost,
 * the worst that happens is an extra reminder.
 */
const KEY = 'lastBackupAt'
/** After how many days without a backup to remind. */
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
    // Storage is unavailable — we will simply remind again.
  }
}

/** There was no backup, or it is older than BACKUP_REMIND_DAYS days. */
export function backupOverdue(now = Date.now()): boolean {
  const last = lastBackupAt()
  return !last || now - last.getTime() > BACKUP_REMIND_DAYS * DAY_MS
}

/** "today", "yesterday", "9 days ago" — for the reminder and Settings. */
export function backupAge(now = Date.now()): string | null {
  const last = lastBackupAt()
  if (!last) return null
  const days = Math.floor((now - last.getTime()) / DAY_MS)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
