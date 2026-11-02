# Prompts for an AI agent (Claude Code and others)

Open the kit folder in the agent and paste one of the texts below in full: "New install" if Recallo is not on this Mac yet, "Upgrade" if it is already installed.

## New install

---

This folder contains the Recallo app kit (macOS). Install it on this Mac strictly following `DEPLOY.md` from the same folder and report back point by point.

1. Find the architecture (`uname -m`) and the macOS version (13+ is required). Check the checksums: `shasum -a 256 -c SHA256SUMS.txt`.
2. Install the app with "Option A" (the DMG for this architecture → `/Applications/Recallo.app`). If that fails — with "Option B" (build from `Recallo-*-source.zip` with `scripts/setup-mac.sh`; install Node.js 22+ via Homebrew if needed, asking me first). If Recallo is already installed, stop and tell me: there is an "Upgrade" prompt for that case.
3. Do not move words or progress: Recallo must start with an empty database. Do not copy anything into `~/Library/Application Support/Recallo/`.
4. Launch Recallo (`open -a Recallo`) and check: the version (`defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString`) and that the window opened. If Gatekeeper blocks the first launch, do what DEPLOY.md says ("Option A"), explaining to me what you are doing.
5. Connect Recallo to Claude Code following "Connecting Claude (MCP)". The Agent API is off in a new install — ask me to turn it on in Settings → Agent API, then check `claude mcp list` → `recallo … ✔ Connected` and call `list_sets` for English — it should return an empty list.
6. Do not change system settings yourself. Remind me to install the Argentine voice for speech ("Voices for speech") and that I can check it in Settings → Voices.
7. At the end, report briefly: what was installed and which option worked, whether MCP is connected, and what is left for me to do by hand.

---

## Upgrade

---

This folder contains a new version of Recallo (macOS), and Recallo is already installed on this Mac with my words. Upgrade it strictly following `UPGRADE.md` from the same folder, losing nothing, and report back point by point.

1. Find the installed version (`defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString`) and how many cards there are now (`sqlite3 ~/Library/Application\ Support/Recallo/recallo.sqlite "SELECT COUNT(*) FROM cards"`). If the installed version is the same as or newer than the kit's, tell me and stop.
2. Check whether Recallo is open (`osascript -e 'application "Recallo" is running'`). If it is — ask me whether it can be closed, and close it only after my "yes" (`osascript -e 'quit app "Recallo"'`).
3. Run `bash upgrade-mac.sh` from this folder. It checks the DMG, makes a database copy and replaces the app by itself. If the script stops with an error — tell me what it says and do not fix anything yourself; do not change the database or files in `~/Library/Application Support/Recallo/` by hand.
4. Launch Recallo (`open -a Recallo`) and check against "Checking after the upgrade": the version is new, `PRAGMA user_version` = 8, the card count is the same as in step 1. If Gatekeeper blocks the first launch, do what DEPLOY.md says ("Option A"), explaining to me what you are doing.
5. The Claude (MCP) connection does not need changes after an upgrade — only check `claude mcp list` if it was set up.
6. At the end, report briefly: from which version to which you upgraded, where the database copy is, whether the card count matched, and what is left for me to do by hand.
