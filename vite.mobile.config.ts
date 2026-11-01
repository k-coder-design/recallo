import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const publicDir = fileURLToPath(new URL('./src/mobile/public', import.meta.url))

/**
 * Телефонная сборка Recallo: Mobile (D57) — статические файлы для GitHub Pages в dist/mobile.
 * Тот же интерфейс (src/renderer) и ядро (src/main/domain), база — SQLite WebAssembly в Worker.
 */
export default defineConfig({
  root: fileURLToPath(new URL('./src/mobile', import.meta.url)),
  // Относительные пути: сайт GitHub Pages живёт в подпапке с именем репозитория.
  base: './',
  plugins: [react(), offlineWorker()],
  define: { __RECALLO_PLATFORM__: JSON.stringify('phone') },
  resolve: {
    alias: { 'node:crypto': fileURLToPath(new URL('./src/mobile/shims/crypto.ts', import.meta.url)) }
  },
  // Пакет SQLite сам находит sqlite3.wasm рядом с собой; предварительная сборка Vite это ломает.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  build: {
    outDir: fileURLToPath(new URL('./dist/mobile', import.meta.url)),
    emptyOutDir: true,
    target: 'safari17'
  }
})

/**
 * Работа без сети (W4): при сборке пишет sw.js со списком всех файлов приложения.
 * Service worker сохраняет их на телефоне при установке и отдаёт из кэша; у каждой сборки
 * свой кэш (по хешу содержимого всех файлов), поэтому новая версия ставится целиком, а старая удаляется.
 */
function offlineWorker(): Plugin {
  return {
    name: 'recallo-offline-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256')
      const files = ['./']
      for (const [name, output] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        files.push(`./${name}`)
        hash.update(name).update(output.type === 'chunk' ? output.code : output.source)
      }
      for (const file of listFiles(publicDir).sort()) {
        const name = relative(publicDir, file).split('\\').join('/')
        files.push(`./${name}`)
        hash.update(name).update(readFileSync(file))
      }
      const version = hash.digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(version, files) })
    }
  }
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : entry.name.startsWith('.') ? [] : [join(dir, entry.name)]
  )
}

function serviceWorker(version: string, files: string[]): string {
  return `// Recallo: Mobile — работа без сети. Создан при сборке (vite.mobile.config.ts), не править вручную.
const CACHE = 'recallo-${version}'
const FILES = ${JSON.stringify(files, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)))
})

// Старые версии удаляются, когда новая стала активной.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('recallo-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

// Новая версия ждёт, пока пользователь не нажмёт «Update» (сообщение со страницы).
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  // ignoreVary: сервер помечает файлы «Vary: Origin» и т. п., а скрипты страница запрашивает
  // с другими заголовками, чем при сохранении, — без этого кэш не находился бы без сети.
  event.respondWith(
    caches
      .match(request, { ignoreSearch: true, ignoreVary: true })
      .then((hit) => hit || (request.mode === 'navigate' ? caches.match('./', { ignoreVary: true }) : undefined))
      .then((hit) => hit || fetch(request))
  )
})
`
}
