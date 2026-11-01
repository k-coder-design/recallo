import type { OpenedFile, SaveResult } from '../shared/types'

/** Как на Mac (fileTransfer.ts): больше 20 МБ ни импорт, ни копия не бывают. */
const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * Выбор файла на телефоне (D57): системный выбор из «Файлов», iCloud Drive и т. п.
 * Вызывать сразу из нажатия кнопки — иначе iOS не откроет выбор. Отмена — null.
 */
export function openFile(kind: 'import' | 'backup'): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = kind === 'import' ? '.csv,.json,.txt,.tsv,text/plain,text/csv,application/json' : '.json,application/json'
    input.style.display = 'none'
    let settled = false
    const finish = (result: OpenedFile | null, error?: Error) => {
      if (settled) return
      settled = true
      input.remove()
      if (error) reject(error)
      else resolve(result)
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      if (file.size > MAX_FILE_BYTES) return finish(null, new Error('This file is too large (more than 20 MB).'))
      file.text().then(
        (content) => finish({ name: file.name, content }),
        () => finish(null, new Error('Could not read this file.'))
      )
    })
    // Закрыли выбор, ничего не выбрав (Safari 16.4+ и Chromium сообщают это событием cancel).
    input.addEventListener('cancel', () => finish(null))
    document.body.append(input)
    input.click()
  })
}

/**
 * Сохранение файла на телефоне (D57): системное меню «Поделиться» с файлом — «Сохранить в Файлы»,
 * iCloud Drive, AirDrop. Где меню с файлами недоступно (браузер на компьютере) — обычная загрузка.
 * Путь к файлу браузер не сообщает, поэтому path всегда null.
 */
export async function saveFile(filename: string, content: string, type = 'application/json'): Promise<SaveResult> {
  const file = new File([content], filename, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return { saved: true, path: null }
    } catch (error) {
      // Пользователь закрыл меню — ничего не сохранено, это не ошибка.
      if (error instanceof DOMException && error.name === 'AbortError') return { saved: false, path: null }
      // NotAllowedError: меню требует свежего нажатия, а оно «истекло», пока готовился файл, — тогда загрузка.
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error
    }
  }
  download(file)
  return { saved: true, path: null }
}

function download(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  // Ссылку освобождаем позже: Safari начинает загрузку не сразу.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
