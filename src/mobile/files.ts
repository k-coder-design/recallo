import type { OpenedFile, SaveResult } from '../shared/types'

/** As on the Mac (fileTransfer.ts): neither an import nor a backup is ever larger than 20 MB. */
const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * Picking a file on the phone (D57): the system picker for Files, iCloud Drive and so on.
 * Call it right from a button tap — otherwise iOS will not open the picker. Cancel — null.
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
    // The picker was closed without choosing (Safari 16.4+ and Chromium report it with a cancel event).
    input.addEventListener('cancel', () => finish(null))
    document.body.append(input)
    input.click()
  })
}

/**
 * Saving a file on the phone (D57): the system Share sheet with the file — Save to Files,
 * iCloud Drive, AirDrop. Where a Share sheet with files is unavailable (a desktop browser) — a regular download.
 * The browser does not report the file path, so path is always null.
 */
export async function saveFile(filename: string, content: string, type = 'application/json'): Promise<SaveResult> {
  const file = new File([content], filename, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return { saved: true, path: null }
    } catch (error) {
      // The user closed the sheet — nothing saved, and that is not an error.
      if (error instanceof DOMException && error.name === 'AbortError') return { saved: false, path: null }
      // NotAllowedError: the sheet needs a fresh tap, which "expired" while the file was prepared — then a download.
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
  // Release the link later: Safari does not start the download right away.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
