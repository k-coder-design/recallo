#!/usr/bin/env bash
# Установка Recallo на Mac из исходников. Работает без вопросов — подходит и для ИИ-агента.
#   bash scripts/setup-mac.sh               — проверить окружение, установить зависимости, прогнать тесты, установить в /Applications
#   bash scripts/setup-mac.sh --no-install  — то же, но только собрать dist/…/Recallo.app, в /Applications не копировать
#   bash scripts/setup-mac.sh --skip-tests  — без typecheck и тестов (быстрее)
# Данные пользователя (~/Library/Application Support/Recallo) скрипт не трогает.
set -euo pipefail
cd "$(dirname "$0")/.."

INSTALL=1
TESTS=1
for arg in "$@"; do
  case "$arg" in
    --no-install) INSTALL=0 ;;
    --skip-tests) TESTS=0 ;;
    -h | --help)
      sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "✗ Unknown option: $arg (see --help)" >&2
      exit 2
      ;;
  esac
done

step() { printf '\n▶ %s\n' "$1"; }
fail() {
  printf '✗ %s\n' "$1" >&2
  exit 1
}

step "Checking the system"
[ "$(uname -s)" = "Darwin" ] || fail "Recallo is a macOS app; this script runs only on macOS."
echo "macOS $(sw_vers -productVersion), $(uname -m)"

step "Checking Node.js (22 or newer)"
command -v node >/dev/null || fail "Node.js is not installed. Install Node.js 22+ from https://nodejs.org or with Homebrew: brew install node"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $(node -v) is too old. Install Node.js 22 or newer."
echo "Node.js $(node -v), npm $(npm -v)"

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Note: Xcode Command Line Tools are not installed. They are needed only if the database module has to be compiled; install with: xcode-select --install"
fi

step "Installing dependencies (npm ci)"
npm ci

if [ "$TESTS" = 1 ]; then
  step "Checking types and running tests"
  npm run typecheck
  npm test
fi

if [ "$INSTALL" = 1 ]; then
  step "Building and installing Recallo to /Applications"
  npm run install:mac
  step "Done"
  echo "Open Recallo from Applications (or run: open -a Recallo)."
else
  step "Building Recallo.app"
  npm run dist:mac
  step "Done"
  echo "Built: $(node scripts/mac-app.mjs path)"
fi
