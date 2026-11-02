import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { AutoBackup, backupsToKeep } from './autoBackup'
import { SettingsService } from './domain/settings'
import { MINUTE, setup } from './domain/test-helpers'

const DAY = 24 * 60 * MINUTE

/** Test temp folders are removed after the run so they do not pile up in the system temp folder. */
const tempDirs: string[] = []
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function context() {
  const t = setup()
  const settings = new SettingsService(t.db)
  const folder = join(tempDir('recallo-backup-'), 'backups')
  const backup = new AutoBackup(t.transfer, settings, folder, t.now)
  const files = () => readdirSync(folder).sort()
  return { t, settings, folder, backup, files }
}

function days(from: string, count: number): string[] {
  const start = new Date(`${from}T12:00:00Z`).getTime()
  return Array.from({ length: count }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10))
}

describe('Automatic backup (MVP-9)', () => {
  it('rotation: the last 7 days and one backup for each of the 4 previous weeks', () => {
    const all = days('2026-09-01', 45) // 01.09 — 15.10
    const keep = [...backupsToKeep(all)].sort()
    expect(keep).toHaveLength(11)
    expect(keep.slice(-7)).toEqual(all.slice(-7))
    // Weekly ones are the most recent dates of their weeks (weeks start on Monday).
    expect(keep.slice(0, 4)).toEqual(['2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'])
  })

  it('a backup is made once a day, the next day a new one', async () => {
    const { t, backup, files, settings } = context()
    t.addCard({ term: 'reckless' })
    await backup.runIfDue()
    await backup.runIfDue()
    expect(files()).toHaveLength(1)
    expect(settings.autoBackup()).toMatchObject({ enabled: true, lastError: null })
    expect(settings.autoBackup().lastAt).not.toBeNull()
    t.advance(DAY)
    await backup.runIfDue()
    expect(files()).toHaveLength(2)
  })

  it('restore accepts the backup: it has cards and progress', async () => {
    const { t, backup, files, folder } = context()
    t.addCard({ term: 'reckless' })
    t.addCard({ term: 'genuine' })
    await backup.runIfDue()
    const content = readFileSync(join(folder, files()[0] as string), 'utf8')
    expect(t.transfer.inspectBackup(content)).toMatchObject({ cards: 2 })
  })

  it('after 40 days no more than 7 + 4 backups remain; other files in the folder are not touched', async () => {
    const { t, backup, files, folder } = context()
    await backup.runIfDue()
    writeFileSync(join(folder, 'my notes.txt'), 'keep me')
    writeFileSync(join(folder, 'Recallo backup 2026-01-01 manual.json'), '{}')
    for (let i = 0; i < 40; i++) {
      t.advance(DAY)
      await backup.runIfDue()
    }
    const backups = files().filter((f) => /^Recallo backup \d{4}-\d{2}-\d{2}\.json$/.test(f))
    expect(backups.length).toBeLessThanOrEqual(11)
    expect(backups.length).toBeGreaterThanOrEqual(10)
    expect(files()).toEqual(expect.arrayContaining(['my notes.txt', 'Recallo backup 2026-01-01 manual.json']))
  })

  it('a disabled automatic backup writes nothing; enabling it makes a backup right away', async () => {
    const { backup, settings } = context()
    settings.setAutoBackupEnabled(false)
    expect((await backup.runIfDue()).count).toBe(0)
    const state = await backup.setEnabled(true)
    expect(state).toMatchObject({ enabled: true, count: 1 })
  })

  it('a write failure does not break anything: the error is saved, the next successful backup clears it', async () => {
    const { t, settings } = context()
    const blocked = join(tempDir('recallo-blocked-'), 'file')
    writeFileSync(blocked, 'not a folder')
    const failing = new AutoBackup(t.transfer, settings, join(blocked, 'backups'), t.now)
    const state = await failing.runIfDue()
    expect(state.lastError).toBeTruthy()
    expect(state.lastAt).toBeNull()

    const working = new AutoBackup(t.transfer, settings, join(tempDir('recallo-ok-'), 'backups'), t.now)
    expect(await working.runIfDue()).toMatchObject({ lastError: null, count: 1 })
  })
})
