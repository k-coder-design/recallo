# Upgrading Recallo to the latest version

For those who already have Recallo installed (version 0.4.0 or newer). The kit contains one version; all the changes below arrive at once. Words, sets, progress and history are kept: they live separately from the app, in `~/Library/Application Support/Recallo/`. A fresh install from scratch is in [DEPLOY.md](DEPLOY.md).

Which version is installed now:

```bash
defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString
```

## What changed

### 0.11.2

- **Tooltips** on icon buttons in Study (↶ undo, ✎ edit, 🗑 delete) and on the ✨ · ✓ · ✗ counters — they appear right away on hover.

### 0.11.1

- **The Study session bar** is one compact line: the set name (a long one is cut), the ✨ · ✓ · ✗ counters, the timer, small ↶ and End session buttons. Labels no longer wrap.

### 0.11.0

- **New-word limit mid-session**: instead of waiting with "Next review in…", Study offers a choice — **Practice current words** (practice the started words without waiting until the session ends) or **Learn 5 new words**.
- **New words mixed in**: a new word is followed by an already known one, and when studying a set also by learned words of that set. New words no longer come in a long run one after another.

### 0.10.2

- The Edit set, Delete set, Import, Export and + New card buttons in Cards no longer shrink with a long set name — the long name wraps to the next line.

### 0.10.1

- An emoji made of several characters (e.g. "👨‍👩") no longer overlaps the word in the Cards list and no longer spills out of the circle on the card.

### 0.10.0

- **Search in Cards** finds by part of a word and by the words of a phrase in any order ("hold at bay" → "hold/keep sth (sb) at bay"), also searches examples with translations, forgives one typo in words of 5+ letters and puts the best matches first. Agents get the same search through the API and MCP.
- **Status filter** in Cards: All / New / Introduced / Learning / Review / Relearning, with card counts.
- **Delete in Study**: a trash can in the card's corner, with confirmation.

### 0.9.0 and 0.9.1

- **First meeting with a new word**: the card shows everything at once — word, pronunciation, meaning and examples — with a "✨ New word · first meeting" label and a single **Continue** button (Space, Enter, → or a swipe in any direction). The "Not yet / Got it" buttons are gone. You will be asked to recall the word in about a minute, as before.
- **Animations**: the card flips on "Show answer". After a new word the card leaves sideways, the next new word comes in from the right, and a recall card rises from below. If Reduce motion is on in macOS, there are no animations.
- **Faster**: fewer database queries per card, swiping and the timer do not re-render the whole card, a grade is written without needless waiting for the disk.

Words previously postponed with "Not yet" simply show up as a whole new card. The daily new-word limit, statistics, automatic backups, and the API and MCP for agents work as before: there is no need to set up the Claude connection again.

## What happens to the data

The database structure in 0.9.x–0.11.x is the same as in 0.7.0–0.8.x. Older databases are upgraded by Recallo itself on first launch:

| Installed now | What the new version does on first launch |
| --- | --- |
| 0.7.0 – 0.10.x | Nothing — the database already fits |
| 0.5.1 – 0.6.1 | Adds the typed-answer fields (migration 8) |
| 0.4.0 – 0.5.0 | Adds the second Spanish pronunciation and the typed-answer fields (migrations 7–8); transcriptions fill in by themselves |

The database upgrade is irreversible for versions older than 0.7.0, so a copy is always made before installing (the script makes it by itself).

## Upgrading with the script (recommended)

1. Close Recallo (⌘Q). The script does not close an open app and refuses to run.
2. In Terminal go to the kit folder and run:

```bash
bash upgrade-mac.sh
```

The script:
- picks the DMG for your Mac (Apple Silicon or Intel) and checks its checksum;
- compares versions and does nothing if the same or a newer one is installed (`--force` — reinstall);
- saves a database copy to `~/Library/Application Support/Recallo/recallo.before-<version>.sqlite` and checks it;
- replaces `/Applications/Recallo.app` and checks that the right version was installed.

3. Launch Recallo: `open -a Recallo`. If macOS will not open the app — right-click Recallo in Applications → Open (details in DEPLOY.md, "Option A").

## Upgrading by hand

1. Close Recallo (⌘Q).
2. Make a database copy (replace `0.11.0` with the version being installed):

```bash
cd ~/Library/Application\ Support/Recallo
sqlite3 recallo.sqlite ".backup recallo.before-0.11.0.sqlite"
```

Or through the interface: Settings → Backup → "Create backup…".

3. Open the DMG for your Mac (`uname -m`: `arm64` → `…-arm64.dmg`, `x86_64` → `…-x64.dmg`) and drag Recallo into Applications, replacing the old one.
4. Launch Recallo.

From source: unpack `Recallo-<version>-source.zip` and run `bash scripts/setup-mac.sh` — it replaces the app in Applications and does not touch the data. Make the database copy beforehand, as in step 2.

## Checking after the upgrade

```bash
defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString
sqlite3 ~/Library/Application\ Support/Recallo/recallo.sqlite "PRAGMA user_version; SELECT COUNT(*) FROM cards;"
```

The first command prints the new version, the second — `8` and the number of cards (the same as before). In the app: Cards has status filter buttons under the search; Study → Paddle out shows a new word in full with a Continue button.

## If something went wrong — rollback

1. Close Recallo (⌘Q).
2. Restore the database from the copy:

```bash
cd ~/Library/Application\ Support/Recallo
rm -f recallo.sqlite-wal recallo.sqlite-shm
cp recallo.before-0.11.0.sqlite recallo.sqlite
```

3. Install the previous version from its DMG, if you still have it. Versions 0.7.0–0.9.x open the database even without a rollback; older ones only with the database from the copy.

## For an AI agent

Open the kit folder in the agent (Claude Code and others) and paste the text from the "Upgrade" section of [AGENT_PROMPT.md](AGENT_PROMPT.md).
