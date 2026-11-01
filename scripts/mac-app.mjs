#!/usr/bin/env node
// Служебные шаги сборки для macOS, не зависящие от архитектуры (Apple Silicon — dist/mac-arm64, Intel — dist/mac).
//   node scripts/mac-app.mjs sign     — ad-hoc подпись собранного Recallo.app (нужна, чтобы приложение запускалось)
//   node scripts/mac-app.mjs install  — копирует Recallo.app в /Applications (Recallo должен быть закрыт)
//   node scripts/mac-app.mjs path     — печатает путь к собранному Recallo.app
//   node scripts/mac-app.mjs running  — открыт ли Recallo (код выхода 0 — открыт, 1 — нет)
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const TARGET = '/Applications/Recallo.app'

function builtApp() {
  const candidates = existsSync(dist)
    ? readdirSync(dist)
        .filter((name) => name === 'mac' || name.startsWith('mac-'))
        .map((name) => join(dist, name, 'Recallo.app'))
        .filter((path) => existsSync(path))
    : []
  // Сборка под текущую архитектуру — в приоритете.
  const preferred = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
  const app = candidates.find((path) => path.includes(`/${preferred}/`)) ?? candidates[0]
  if (!app) fail('Recallo.app not found in dist/. Run "npm run dist:mac" first.')
  return app
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

/**
 * Открыто ли приложение Recallo: главный процесс с любыми аргументами. MCP-сервер для Claude запускается
 * тем же файлом Recallo (с out/mcp/index.cjs) — это не открытое приложение, его не считаем.
 */
function isRunning() {
  const processes = execFileSync('ps', ['-axo', 'command']).toString().split('\n')
  return processes.some((line) => /Recallo\.app\/Contents\/MacOS\/Recallo(\s|$)/.test(line) && !line.includes('out/mcp/index.cjs'))
}

const command = process.argv[2]
if (process.platform !== 'darwin') fail('This script is for macOS only.')

if (command === 'running') {
  const running = isRunning()
  console.log(running ? 'Recallo is running' : 'Recallo is not running')
  process.exit(running ? 0 : 1)
} else if (command === 'path') {
  console.log(builtApp())
} else if (command === 'sign') {
  const app = builtApp()
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  console.log(`✓ Signed ${app}`)
} else if (command === 'install') {
  const app = builtApp()
  if (isRunning()) fail('Recallo is running. Quit it (⌘Q) and run the command again — your data is kept.')
  execFileSync('rm', ['-rf', TARGET])
  execFileSync('ditto', [app, TARGET])
  // Своё приложение, собранное на этом Mac, не помечается как скачанное — Gatekeeper не спросит разрешения.
  execFileSync('xattr', ['-dr', 'com.apple.quarantine', TARGET], { stdio: 'ignore' })
  const version = execFileSync('defaults', ['read', join(TARGET, 'Contents/Info.plist'), 'CFBundleShortVersionString']).toString().trim()
  console.log(`✓ Installed Recallo ${version} to ${TARGET}`)
} else {
  fail('Usage: node scripts/mac-app.mjs <sign|install|path|running>')
}
