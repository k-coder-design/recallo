import { BrowserWindow, app, dialog } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BackupSummary, ExportFormat, OpenedFile, SaveResult, SetScope, SpaceId } from '../shared/types'
import type { NativeDb } from './db/database'
import { DomainError } from './domain/errors'
import type { TransferService } from './domain/transfer'

const MAX_FILE_BYTES = 20 * 1024 * 1024
/**
 * Только для автотестов: системные диалоги нельзя нажать программно, поэтому при заданных
 * переменных файл открывается из `${RECALLO_TEST_OPEN_DIR}/<import|backup>`, а сохраняется в RECALLO_TEST_SAVE_DIR.
 */
const TEST_OPEN_DIR = process.env['RECALLO_TEST_OPEN_DIR']
const TEST_SAVE_DIR = process.env['RECALLO_TEST_SAVE_DIR']

/** Файловые диалоги macOS вокруг импорта, экспорта и полной копии: файлы читает и пишет только main-процесс. */
export class FileTransfer {
  constructor(
    private readonly transfer: TransferService,
    private readonly db: NativeDb,
    private readonly userDataDir: string
  ) {}

  private window(): BrowserWindow | undefined {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  }

  async open(kind: 'import' | 'backup'): Promise<OpenedFile | null> {
    if (TEST_OPEN_DIR) return { name: `${kind}.test`, content: await readFile(join(TEST_OPEN_DIR, kind), 'utf8') }
    const options: Electron.OpenDialogOptions = {
      title: kind === 'import' ? 'Import cards' : 'Restore from backup',
      // Восстановление открывается сразу в папке автокопий (D51).
      ...(kind === 'backup' ? { defaultPath: join(this.userDataDir, 'backups') } : {}),
      properties: ['openFile'],
      filters:
        kind === 'import'
          ? [{ name: 'Cards (CSV, JSON, text)', extensions: ['csv', 'json', 'txt', 'tsv'] }]
          : [{ name: 'Recallo backup', extensions: ['json'] }]
    }
    const parent = this.window()
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    if ((await stat(path)).size > MAX_FILE_BYTES) throw new DomainError('VALIDATION', 'The file is larger than 20 MB')
    return { name: path.split('/').pop() ?? path, content: await readFile(path, 'utf8') }
  }

  private async save(filename: string, content: string, filterName: string): Promise<SaveResult> {
    if (TEST_SAVE_DIR) {
      await writeFile(join(TEST_SAVE_DIR, filename), content, 'utf8')
      return { saved: true, path: join(TEST_SAVE_DIR, filename) }
    }
    const extension = filename.split('.').pop() ?? 'txt'
    const options: Electron.SaveDialogOptions = {
      defaultPath: join(app.getPath('documents'), filename),
      filters: [{ name: filterName, extensions: [extension] }]
    }
    const parent = this.window()
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { saved: false, path: null }
    await writeFile(result.filePath, content, 'utf8')
    return { saved: true, path: result.filePath }
  }

  exportDictionary(spaceId: SpaceId, scope: SetScope | undefined, format: ExportFormat): Promise<SaveResult> {
    const file = this.transfer.exportDictionary(spaceId, scope, format)
    return this.save(file.filename, file.content, format === 'csv' ? 'CSV' : 'JSON')
  }

  backup(): Promise<SaveResult> {
    const file = this.transfer.backup()
    return this.save(file.filename, file.content, 'Recallo backup')
  }

  /** Перед восстановлением текущая база сохраняется рядом с ней — шаг можно откатить. */
  async restore(content: string): Promise<BackupSummary & { safetyCopy: string }> {
    this.transfer.inspectBackup(content)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safetyCopy = join(this.userDataDir, `recallo.before-restore-${stamp}.sqlite`)
    await this.db.backup(safetyCopy)
    return { ...this.transfer.restore(content), safetyCopy }
  }
}
