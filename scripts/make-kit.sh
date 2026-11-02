#!/usr/bin/env bash
# A kit for installing and upgrading Recallo on another Mac — one folder dist/kit/Recallo-<version>
# (DMGs for Apple Silicon and Intel, upgrade script, source archive, instructions, checksums)
# and the same as one file dist/kit/Recallo-<version>.zip — for sending. Run: npm run kit:mac
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p 'require("./package.json").version')
NAME="Recallo-$VERSION"
KIT="dist/kit/$NAME"

echo "▶ Building DMGs for Apple Silicon and Intel"
rm -rf dist
npm run release:mac
# After building x64 and arm64 the database module in node_modules is built for arm64 — rebuild it for the current architecture.
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
# ditto keeps permissions (upgrade-mac.sh stays executable) and writes an archive that Finder opens with a double click.
(cd dist/kit && ditto -c -k --keepParent "$NAME" "$NAME.zip")

echo "✓ Kit is ready: $KIT (folder) and dist/kit/$NAME.zip (one file to send)"
ls -lh "$KIT" "dist/kit/$NAME.zip"
