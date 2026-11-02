#!/usr/bin/env bash
# Upgrades an installed Recallo from the kit (DMG), keeping words and progress.
# Run from the kit folder: bash upgrade-mac.sh [--force]
#   --force — reinstall even if the same or a newer version is installed.
# Recallo must be closed: the script does not close it. A database copy is made before replacing the app.
# For testing on folder copies you can override: RECALLO_APPS_DIR, RECALLO_DATA_DIR.
set -euo pipefail
cd "$(dirname "$0")"

APPS_DIR="${RECALLO_APPS_DIR:-/Applications}"
DATA_DIR="${RECALLO_DATA_DIR:-$HOME/Library/Application Support/Recallo}"
APP="$APPS_DIR/Recallo.app"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

fail() { echo "✗ $*" >&2; exit 1; }
step() { echo "▶ $*"; }

[ "$(uname -s)" = "Darwin" ] || fail "This script is for macOS only."

# 1. Which DMG fits this Mac.
ARCH=$(uname -m | sed 's/x86_64/x64/')
DMG=$(ls Recallo-*-"$ARCH".dmg 2>/dev/null | sort | tail -1 || true)
[ -n "$DMG" ] || fail "No Recallo-<version>-$ARCH.dmg next to this script. Run it from the kit folder."
NEW_VERSION=${DMG#Recallo-}
NEW_VERSION=${NEW_VERSION%-"$ARCH".dmg}

if [ -f SHA256SUMS.txt ]; then
  step "Checking the checksum of $DMG"
  grep " $DMG\$" SHA256SUMS.txt | shasum -a 256 -c - >/dev/null || fail "$DMG is damaged or incomplete. Copy the kit again."
fi

# 2. What is installed now.
OLD_VERSION=""
[ -d "$APP" ] && OLD_VERSION=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)

# Compare versions like 0.9.1: 0 — equal, 1 — the first is greater, 2 — the second is greater.
compare() {
  local IFS=.
  local -a a=($1) b=($2)
  for i in 0 1 2; do
    local x=${a[i]:-0} y=${b[i]:-0}
    if ((10#$x > 10#$y)); then return 1; fi
    if ((10#$x < 10#$y)); then return 2; fi
  done
  return 0
}

if [ -z "$OLD_VERSION" ]; then
  echo "Recallo is not installed in $APPS_DIR — this is a fresh install, see DEPLOY.md (Option A)."
  [ "$FORCE" = 1 ] || exit 1
else
  set +e; compare "$OLD_VERSION" "$NEW_VERSION"; RESULT=$?; set -e
  if [ "$RESULT" != 2 ] && [ "$FORCE" = 0 ]; then
    echo "✓ Installed: $OLD_VERSION, kit: $NEW_VERSION — nothing to update. Use --force to reinstall."
    exit 0
  fi
  echo "Installed: $OLD_VERSION → updating to $NEW_VERSION"
fi

# 3. The app must be closed (MCP server processes started by Claude do not get in the way).
OPEN=$(ps -axo command | awk -v exe="$APP/Contents/MacOS/Recallo" \
  '($0 == exe || index($0, exe " ") == 1) && index($0, "out/mcp/index.cjs") == 0')
[ -z "$OPEN" ] || fail "Recallo is open. Quit it (⌘Q) and run this script again — your words are kept."

# 4. Database copy before the upgrade: the new version updates the schema itself, and the copy lets you go back.
DB="$DATA_DIR/recallo.sqlite"
if [ -f "$DB" ]; then
  BACKUP="$DATA_DIR/recallo.before-$NEW_VERSION.sqlite"
  step "Backing up your words to $BACKUP"
  sqlite3 "$DB" ".backup '$BACKUP'"
  [ "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check')" = "ok" ] || fail "The backup copy failed its check. Nothing was changed."
  # The copy is a single file without -wal/-shm next to it: easier to keep and move.
  sqlite3 "$BACKUP" 'PRAGMA journal_mode = DELETE' >/dev/null
  CARDS=$(sqlite3 "$BACKUP" 'SELECT COUNT(*) FROM cards')
  echo "  $CARDS cards saved"
else
  echo "No database in $DATA_DIR yet — nothing to back up."
fi

# 5. Replace the app. The data lives separately and is not touched.
step "Installing Recallo $NEW_VERSION to $APP"
MOUNT=$(mktemp -d)
# hdiutil works on all supported macOS versions (13+); the newer macOS warning about switching to diskutil is hidden.
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$DMG" >/dev/null 2>"$MOUNT.log" || { cat "$MOUNT.log" >&2; fail "Could not open $DMG."; }
trap 'hdiutil detach "$MOUNT" >/dev/null 2>&1 || true' EXIT
rm -rf "$APP"
ditto "$MOUNT/Recallo.app" "$APP"

INSTALLED=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString)
[ "$INSTALLED" = "$NEW_VERSION" ] || fail "Expected version $NEW_VERSION, found $INSTALLED."

echo "✓ Recallo $INSTALLED is installed. Your words and progress are kept."
echo "  Start it: open -a Recallo"
echo "  If macOS blocks the first start, see DEPLOY.md → Option A (right-click → Open)."
