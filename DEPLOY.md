# Installing Recallo on another Mac

A guide for a person and for an AI agent: every step is a ready command, with no manual file edits. Where the app's interface is needed, it says so explicitly.

## Requirements

- macOS 13 Ventura or newer.
- Apple Silicon (M1 or newer) or Intel. Check: `uname -m` → `arm64` — Apple Silicon, `x86_64` — Intel.
- For installing from source, also: Node.js 22+ and internet access (npm downloads dependencies and Electron).

## The kit

It is built on a Mac where Recallo already works: `npm run kit:mac` → the folder `dist/kit/Recallo-<version>/` and the same as one file `dist/kit/Recallo-<version>.zip` — that is what you send. The recipient unpacks the archive with a double click and starts with `START_HERE.md`.

| File | Purpose |
| --- | --- |
| `Recallo-<version>-arm64.dmg` | The ready app for Apple Silicon |
| `Recallo-<version>-x64.dmg` | The ready app for Intel |
| `Recallo-<version>-source.zip` | Source code — build the app on site |
| `upgrade-mac.sh` | Upgrade an installed Recallo with a database copy — see [UPGRADE.md](UPGRADE.md) |
| `START_HERE.md` | Where to start: a new install, an upgrade, or through an agent |
| `DEPLOY.md` | This guide |
| `UPGRADE.md` | Upgrading from older versions: what changed, steps, checks, rollback |
| `AGENT_PROMPT.md` | Ready prompts for an AI agent: new install and upgrade |
| `SHA256SUMS.txt` | Checksums: `shasum -a 256 -c SHA256SUMS.txt` |

Words and progress are not in the kit — they are moved separately ("Moving words and progress").

## Option A. The ready app from a DMG (recommended)

By hand: open the DMG for your architecture and drag Recallo into Applications.

With commands (the agent runs them from the kit folder). If Recallo is already installed and open, close it first — the agent needs the user's consent: `osascript -e 'quit app "Recallo"'`. Data is kept when the app is replaced.

```bash
ARCH=$(uname -m | sed 's/x86_64/x64/')
DMG=$(ls Recallo-*-"$ARCH".dmg | head -1)
MOUNT=$(mktemp -d)
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$DMG"
rm -rf /Applications/Recallo.app
ditto "$MOUNT/Recallo.app" /Applications/Recallo.app
hdiutil detach "$MOUNT"
```

First launch. The app is signed locally and not notarized by Apple, so macOS asks for permission:

- right-click Recallo in Applications → Open → Open;
- or System Settings → Privacy & Security → Open Anyway.

If macOS says the app is "damaged", that is the "downloaded from the internet" flag on an unsigned app. Remove it (only for Recallo from this kit):

```bash
xattr -dr com.apple.quarantine /Applications/Recallo.app
```

## Option B. Building from source

1. Install Node.js 22+: from https://nodejs.org or `brew install node`. Check: `node -v`.
2. Unpack the archive and run the install — the script checks the environment, installs dependencies, runs checks and tests, builds the app for this Mac's architecture and copies it into Applications:

```bash
unzip Recallo-*-source.zip
cd Recallo-*-source
bash scripts/setup-mac.sh
```

Options: `--no-install` — only build (`dist/mac*/Recallo.app`), do not copy into Applications; `--skip-tests` — without checks, faster. If Recallo is already open, the install stops and asks you to close it — no data is lost on reinstall. Check beforehand: `node scripts/mac-app.mjs running` (exit code 0 — open). MCP server processes started by Claude do not count as the open app.

An app built on the same Mac is not marked as downloaded, so macOS does not ask for permission at launch.

If `npm ci` could not build the database module (`better-sqlite3`), install the developer tools and try again: `xcode-select --install`.

## Checking the install

```bash
defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString
open -a Recallo
```

The first command prints the version. After launch the Recallo window opens; data is created in `~/Library/Application Support/Recallo/` (the database `recallo.sqlite`, automatic backups in `backups/`).

## Moving words and progress

Way 1 — through the interface (how a person does it):

1. On the old Mac: Recallo → Settings → Backup → "Create backup…" (or take the latest file from `~/Library/Application Support/Recallo/backups/` — an automatic backup is made every day).
2. Move the file `Recallo backup <date>.json` to the new Mac.
3. On the new Mac: Settings → Backup → "Restore from backup…" → pick the file → "Replace and restore".

Way 2 — by copying the database (suits an agent, no interface needed). Recallo must be closed on both Macs (⌘Q):

```bash
# On the new Mac, if the recallo.sqlite file from the old Mac is in the current folder:
mkdir -p ~/Library/Application\ Support/Recallo
cp recallo.sqlite ~/Library/Application\ Support/Recallo/recallo.sqlite
```

If Recallo has already run on the new Mac, its current database is replaced — save a copy of it first. On the old Mac, a safe copy of an open database: `sqlite3 ~/Library/Application\ Support/Recallo/recallo.sqlite ".backup recallo.sqlite"`. A newer Recallo version opens an older database and upgrades it by itself.

## Connecting Claude (MCP)

1. In Recallo: Settings → Agent API → turn on (off by default).
2. In Terminal (Claude Code), once:

```bash
claude mcp add --scope user recallo -e ELECTRON_RUN_AS_NODE=1 -- "/Applications/Recallo.app/Contents/MacOS/Recallo" "/Applications/Recallo.app/Contents/Resources/app.asar/out/mcp/index.cjs"
```

3. Check: `claude mcp list` → `recallo … ✔ Connected` (Recallo must be open). For Claude Desktop the ready configuration snippet is in Settings → Agent API.

The agent works with cards only while Recallo is open and the Agent API is on; the token is kept by Recallo, so there is no need to copy it into Claude's settings.

## Voices for speech

Speech uses macOS voices. For the Argentine pronunciation install a voice: System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → Spanish → Argentina (for example, Diego Enhanced), then restart Recallo. What plays for each variant is in Settings → Voices.

## Upgrading and removing

- Upgrade: close Recallo and run `bash upgrade-mac.sh` from the kit folder — it makes a database copy and replaces the app. Details, with rollback and the list of changes — [UPGRADE.md](UPGRADE.md). By hand: the new DMG on top (Option A) or `bash scripts/setup-mac.sh` in the new source version (Option B). Data is kept.
- Removing the app: `rm -rf /Applications/Recallo.app`. Data is removed separately and permanently: `~/Library/Application Support/Recallo/` — make a copy first.

## Building the kit (on the source Mac)

```bash
npm run kit:mac
```

Builds into `dist/kit/Recallo-<version>/` both DMGs, a source archive without `node_modules` and service folders, the upgrade script and the instructions, computes checksums and packs the folder into `dist/kit/Recallo-<version>.zip`.
