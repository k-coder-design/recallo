#!/usr/bin/env bash
# Комплект для установки и обновления Recallo на другом Mac — одна папка dist/kit/Recallo-<версия>
# (DMG для Apple Silicon и Intel, скрипт обновления, архив исходников, инструкции, контрольные суммы)
# и она же одним файлом dist/kit/Recallo-<версия>.zip — чтобы отправить. Запуск: npm run kit:mac
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p 'require("./package.json").version')
NAME="Recallo-$VERSION"
KIT="dist/kit/$NAME"

echo "▶ Building DMGs for Apple Silicon and Intel"
rm -rf dist
npm run release:mac
# После сборки x64 и arm64 модуль базы в node_modules пересобран под arm64 — возвращаем под текущую архитектуру.
npx electron-builder install-app-deps >/dev/null

mkdir -p "$KIT"
mv "dist/Recallo-$VERSION-arm64.dmg" "dist/Recallo-$VERSION-x64.dmg" "$KIT/"

echo "▶ Packing source code"
SRC_NAME="Recallo-$VERSION-source"
STAGE=$(mktemp -d)
rsync -a \
  --exclude node_modules --exclude out --exclude dist --exclude .claude \
  --exclude .DS_Store --exclude '*.tsbuildinfo' --exclude '*.log' \
  ./ "$STAGE/$SRC_NAME/"
(cd "$STAGE" && zip -qr -X "$SRC_NAME.zip" "$SRC_NAME")
mv "$STAGE/$SRC_NAME.zip" "$KIT/"
rm -rf "$STAGE"

cp DEPLOY.md UPGRADE.md AGENT_PROMPT.md "$KIT/"
cp scripts/upgrade-mac.sh "$KIT/upgrade-mac.sh"
chmod +x "$KIT/upgrade-mac.sh"
sed "s/{{VERSION}}/$VERSION/g" scripts/kit-start-here.md > "$KIT/START_HERE.md"
(cd "$KIT" && shasum -a 256 Recallo-* upgrade-mac.sh > SHA256SUMS.txt)

echo "▶ Packing the folder into one file for sending"
# ditto сохраняет права (upgrade-mac.sh остаётся исполняемым) и пишет архив, который Finder открывает двойным кликом.
(cd dist/kit && ditto -c -k --keepParent "$NAME" "$NAME.zip")

echo "✓ Kit is ready: $KIT (folder) and dist/kit/$NAME.zip (one file to send)"
ls -lh "$KIT" "dist/kit/$NAME.zip"
