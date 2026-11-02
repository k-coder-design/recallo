import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutoBackupState } from '../shared/types'
import type { Clock } from './domain/scheduler'
import type { SettingsService } from './domain/settings'
import { localDate } from './domain/stats'
import type { TransferService } from './domain/transfer'

/** How many recent daily backups to keep and for how many past weeks — one each (D51). */
export const KEEP_DAILY = 7
export const KEEP_WEEKLY = 4
const FILE_PATTERN = /^Recallo backup (\d{4}-\d{2}-\d{2})\.json$/

export const backupFileName = (date: string) => `Recallo backup ${date}.json`

/** The Monday of a YYYY-MM-DD date's week — the week key for rotation. */
function weekKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = new Date(Date.UTC(y, m - 1, d))
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

/**
 * Which backups to keep: the 7 most recent dates and one (the most recent) for each of the 4 previous
 * weeks not covered by those 7 dates. The rest are deleted.
 */
export function backupsToKeep(dates: string[]): Set<string> {
  const sorted = [...new Set(dates)].sort().reverse()
  const keep = new Set(sorted.slice(0, KEEP_DAILY))
  const coveredWeeks = new Set([...keep].map(weekKey))
  const weekly = new Map<string, string>()
  for (const date of sorted.slice(KEEP_DAILY)) {
    const week = weekKey(date)
    if (coveredWeeks.has(week) || weekly.has(week)) continue
    if (weekly.size >= KEEP_WEEKLY) break
    weekly.set(week, date)
  }
  for (const date of weekly.values()) keep.add(date)
  return keep
}

/**
 * A daily full backup to the backups folder (MVP-9, D51): at start and once an hour it checks
 * whether there is a backup for today. The format is the same as Settings → Backup; restored with the Restore button.
 * A failure does not get in the way: the error is saved and shown in Settings.
 */
export class AutoBackup {
  private running: Promise<AutoBackupState> | null = null

  constructor(
    private readonly transfer: TransferService,
    private readonly settings: SettingsService,
    readonly folder: string,
    private readonly now: Clock
  ) {}

  private async dates(): Promise<string[]> {
    try {
      return (await readdir(this.folder)).map((name) => FILE_PATTERN.exec(name)?.[1]).filter((d): d is string => Boolean(d))
    } catch {
      return []
    }
  }

  async state(): Promise<AutoBackupState> {
    return { ...this.settings.autoBackup(), folder: this.folder, count: (await this.dates()).length }
  }

  async setEnabled(enabled: unknown): Promise<AutoBackupState> {
    this.settings.setAutoBackupEnabled(enabled)
    if (this.settings.autoBackup().enabled) await this.runIfDue()
    return this.state()
  }

  /** Makes today's backup if there is none yet and deletes extra old ones. Concurrent calls do not duplicate work. */
  runIfDue(): Promise<AutoBackupState> {
    this.running ??= this.run().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async run(): Promise<AutoBackupState> {
    if (!this.settings.autoBackup().enabled) return this.state()
    const today = localDate(this.now())
    try {
      const dates = await this.dates()
      if (!dates.includes(today)) {
        await mkdir(this.folder, { recursive: true })
        await writeFile(join(this.folder, backupFileName(today)), this.transfer.backup().content, 'utf8')
        dates.push(today)
        this.settings.recordAutoBackup({ at: this.now().toISOString() })
      }
      const keep = backupsToKeep(dates)
      for (const date of dates) if (!keep.has(date)) await rm(join(this.folder, backupFileName(date)), { force: true })
    } catch (error) {
      this.settings.recordAutoBackup({ error: error instanceof Error ? error.message : String(error) })
    }
    return this.state()
  }
}
