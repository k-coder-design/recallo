import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { AutoBackup, backupsToKeep } from './autoBackup'
import { SettingsService } from './domain/settings'
import { MINUTE, setup } from './domain/test-helpers'

const DAY = 24 * 60 * MINUTE

/** Временные папки тестов удаляются после прогона, чтобы не копиться в системной папке temp. */
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

describe('Автоматическая резервная копия (MVP-9)', () => {
  it('ротация: 7 последних дней и по одной копии за 4 предыдущие недели', () => {
    const all = days('2026-09-01', 45) // 01.09 — 15.10
    const keep = [...backupsToKeep(all)].sort()
    expect(keep).toHaveLength(11)
    expect(keep.slice(-7)).toEqual(all.slice(-7))
    // Еженедельные — самые свежие даты своих недель (недели с понедельника).
    expect(keep.slice(0, 4)).toEqual(['2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'])
  })

  it('копия делается один раз в день, на следующий день — новая', async () => {
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

  it('копию принимает восстановление: в ней карточки и прогресс', async () => {
    const { t, backup, files, folder } = context()
    t.addCard({ term: 'reckless' })
    t.addCard({ term: 'genuine' })
    await backup.runIfDue()
    const content = readFileSync(join(folder, files()[0] as string), 'utf8')
    expect(t.transfer.inspectBackup(content)).toMatchObject({ cards: 2 })
  })

  it('за 40 дней остаётся не больше 7 + 4 копий; чужие файлы в папке не трогаются', async () => {
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

  it('выключенная автокопия ничего не пишет; включение сразу делает копию', async () => {
    const { backup, settings } = context()
    settings.setAutoBackupEnabled(false)
    expect((await backup.runIfDue()).count).toBe(0)
    const state = await backup.setEnabled(true)
    expect(state).toMatchObject({ enabled: true, count: 1 })
  })

  it('сбой записи не ломает работу: ошибка сохраняется, следующая удачная копия её сбрасывает', async () => {
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
