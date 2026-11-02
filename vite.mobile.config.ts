import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const publicDir = fileURLToPath(new URL('./src/mobile/public', import.meta.url))

/**
 * Recallo: Mobile phone build (D57) — static files for GitHub Pages in dist/mobile.
 * The same interface (src/renderer) and core (src/main/domain); the database is SQLite WebAssembly in a Worker.
 */
export default defineConfig({
  root: fileURLToPath(new URL('./src/mobile', import.meta.url)),
  // Relative paths: a GitHub Pages site lives in a subfolder named after the repository.
  base: './',
  plugins: [react(), offlineWorker()],
  define: { __RECALLO_PLATFORM__: JSON.stringify('phone') },
  resolve: {
    alias: { 'node:crypto': fileURLToPath(new URL('./src/mobile/shims/crypto.ts', import.meta.url)) }
  },
  // The SQLite package finds sqlite3.wasm next to itself; Vite pre-bundling breaks that.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  build: {
    outDir: fileURLToPath(new URL('./dist/mobile', import.meta.url)),
    emptyOutDir: true,
    target: 'safari17'
  }
})

/**
 * Offline mode (W4): at build time writes sw.js with the list of all app files.
 * The service worker saves them on the phone at install (always fresh from the server) and serves them from the cache;
 * the start page comes fresh from the network when online. Each build has its own cache (by a hash of all file
 * contents), so a new version installs whole, takes over by itself, and the old one is removed.
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
  return `// Recallo: Mobile — offline mode. Generated at build time (vite.mobile.config.ts), do not edit by hand.
const CACHE = 'recallo-${version}'
const FILES = ${JSON.stringify(files, null, 2)}

// The start page: fresh from the network when online (it names this build's program files),
// the saved copy only offline or when the network is too slow.
const START_TIMEOUT_MS = 4000

self.addEventListener('install', (event) => {
  // Fresh copies from the server, never from the browser's HTTP cache: a stale start page would point
  // to program files of an older build that no longer exist, and the app would open to a black screen.
  // The new version takes over right away; the page decides when to reload (src/mobile/offline.ts).
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  )
})

// Old versions are removed once the new one becomes active.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('recallo-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

const savedStartPage = () => caches.match('./', { ignoreVary: true })

function freshStartPage(request) {
  const network = fetch(request.url, { cache: 'no-store', credentials: 'same-origin' }).then((response) => {
    if (response.ok) {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put('./', copy))
    }
    return response
  })
  const slow = new Promise((resolve) => setTimeout(resolve, START_TIMEOUT_MS)).then(savedStartPage)
  return Promise.race([network, slow])
    .then((response) => response || network)
    .catch(() => savedStartPage().then((hit) => hit || Response.error()))
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(freshStartPage(request))
    return
  }
  // ignoreVary: the server marks files "Vary: Origin" and so on, while the page requests scripts
  // with different headers than when they were saved — without this the cache would not be found offline.
  event.respondWith(caches.match(request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(request)))
})
`
}
