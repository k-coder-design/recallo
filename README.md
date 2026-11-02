# Recallo

A desktop app for remembering English and Spanish words and phrases: active recall and spaced repetition (FSRS).

Requirements: [duocards_requirements.md](duocards_requirements.md). Decisions: [PLAN.md](PLAN.md). Phases and decisions D14+: [ROADMAP.md](ROADMAP.md). Installing on another Mac: [DEPLOY.md](DEPLOY.md). Notes for AI agents: [AGENTS.md](AGENTS.md). Current version: 0.11.2.

## Features

- **Two languages** — English and Spanish, each with its own cards, sets, progress and statistics.
- **Cards**: a word, a meaning in any language, examples (the word is hidden in them on the front), an emoji association, a transcription. Spanish has two pronunciations — 🇦🇷 Argentina and 🇪🇸 Spain, each with its own voice.
- **Study**: the first meeting with a new word shows the whole card (word, pronunciation, meaning, examples) with a "New word" label and a single "Continue" button, without self-grading; then recall (meaning → word) with FSRS spaced repetition. Animations: the card flips when the answer is shown; after a new word the card leaves sideways, the next new word comes in from the right, and a recall rises from below. New words don't come back to back: after a meeting comes an already met word (early, if nothing is due), and when studying a set also learned words of that set that are closest to review. Swipe or the ← / → keys, undo the last grade (⌘Z), edit a card mid-session. The session bar is one compact line: the set, the ✨ new · ✓ remembered · ✗ forgot counters, the timer, ↶ and End session. Icon buttons ↶, ✎, 🗑 and the counters have quick hover tooltips; buttons with text and 🔊 have none.
- **Search and filter in Cards**: search by part of a word, by the words of a phrase in any order, in meanings, examples, translations and set names, forgiving one typo in words of 5+ letters; best matches first. Status filter buttons (New, Introduced, Learning, Review, Relearning) with card counts.
- **Delete mid-session**: the trash can in the corner of the Study card — with confirmation, then the next card right away.
- **Typed answer mode** (Answer: Type on the Study screen): type the word; the app forgives case, accents, punctuation and one typo and suggests a grade, but you decide — "I was right" or "Count as forgot".
- **Daily new-word limit** (Settings → Study, 10 by default): reviews are not limited; when the limit is reached you can take 5 more once. If the limit runs out mid-session and only later reviews remain, Study offers a choice: "Practice current words" (practice the started words without waiting until the session ends) or "Learn 5 new words".
- **Timed sessions**: No limit, 5, 10 or 15 minutes; at the end — a summary and an extension by 5 / 10 / 15 minutes.
- **Today's swell** — the wave of the day: its height in meters grows with regular study, accurate answers and mastered words.
- **Sets**, search, import (Recallo CSV/JSON, DuoCards, Quizlet), dictionary export, full backup and restore.
- **Automatic backup** once a day (Settings → Backup): the last 7 days are kept, plus one backup for each of the 4 previous weeks.
- **Appearance** — System, Light or Dark (Settings → Appearance).
- **Stats**: word stages, activity over 14 days, the day streak, hard words.
- **Agent API and MCP**: Claude and other agents can read and edit cards and sets (off by default).

## Voices

Speech uses macOS voices. Which voice plays for each variant is shown in **Settings → Voices**. If a voice is missing (for example, the Argentine one), install it: System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → Spanish → Argentina (Diego), then restart Recallo. Until then the Argentine variant shows only its transcription, and you can listen to the Spanish (🇪🇸) variant. If a voice has an improved version (Enhanced or Premium), Recallo picks it. Symbols like ¿ ¡ and " / " are not read aloud: the text is cleaned up before speaking.

## Recallo: Mobile on iPhone

A separate Recallo installation for iPhone — the same screens and learning rules, its own data, no sync with the Mac. Works offline. Address: **https://k-coder-design.github.io/recallo/** (iOS 17 or newer).

1. Open the address in **Safari** on the iPhone → Share → **Add to Home Screen** → Add. From then on open Recallo from its icon.
2. Moving words from the Mac (once): on the Mac in Recallo — Settings → Backup → **Create backup…**, send the file to iCloud Drive or AirDrop it to the iPhone. On the iPhone in Recallo — Settings → Backup → **Restore from backup…** → pick the file → **Replace and restore**.
3. New words: an agent prepares an import file (Recallo JSON), and you open it in Cards → "⋯" → **Import cards**. There is no MCP or Agent API on the phone.
4. Backup: Settings → Backup → **Create backup…** (Share sheet → Save to Files). If there was no backup for a week, Study reminds you. Removing the Recallo icon deletes its data.
5. Updates arrive by themselves: a new version downloads in the background and opens the next time you launch Recallo. During a Study session it waits and shows "New version ready · **Reload**" at the top.

Publishing: every push to the main branch of https://github.com/k-coder-design/recallo builds the phone app and puts it on GitHub Pages (`.github/workflows/pages.yml`). Decisions — D57–D60 in ROADMAP.md.

## Running

The usual way is the **Recallo** app in Applications (or the Dock). After code changes, reinstall: `npm run install:mac` (Recallo must be closed).

Development needs Node.js 22+ and macOS 13+.

```bash
npm ci
```

```bash
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | The app in development mode with hot reload |
| `npm run build` | Build into `out/` |
| `npm start` | Run the built app |
| `npm test` | Tests (Vitest through Electron in Node mode, so better-sqlite3 is the same build). Core tests run twice: the `mac` project on better-sqlite3, the `phone` project on SQLite WebAssembly; just one: `npm test -- --project phone` |
| `npm run typecheck` | Type-check main/preload, the interface and the phone build |
| `npm run build:mobile` | Recallo: Mobile — the iPhone web app in `dist/mobile/` (see ROADMAP, D57) |
| `npm run dev:mobile` | The phone build in development mode in a browser |
| `swift scripts/render-mobile-icons.swift` | Render the iPhone icons from `build/icon-mobile.svg` |
| `npm run import:set -- <file.json> [--dry-run]` | Load a set from `data/sets/*.json` (creates the set, skips duplicates) |
| `npm run dist:mac` | Build Recallo.app for this Mac's architecture (`dist/mac-arm64/` or `dist/mac/`) |
| `npm run install:mac` | Build and install Recallo into Applications |
| `npm run release:mac` | Build DMGs for Apple Silicon and Intel: `dist/Recallo-<version>-arm64.dmg`, `…-x64.dmg` |
| `npm run kit:mac` | A kit for another Mac — the folder `dist/kit/Recallo-<version>/` and its `.zip` for sending: both DMGs, the upgrade script, a source archive, START_HERE / DEPLOY / UPGRADE, checksums |
| `bash scripts/setup-mac.sh` | Install from source on a new Mac with one command (see DEPLOY.md) |
| `npm run import:duocards -- <file.csv> [--space en\|es] [--dry-run]` | Load a DuoCards CSV export (front, back, hint) as cards; duplicates by word are skipped |

Data is stored in SQLite: `~/Library/Application Support/Recallo/recallo.sqlite`, automatic backups next to it in `backups/`.
For experiments you can use a separate folder: `RECALLO_USER_DATA=/path/to/folder npm run dev`.

## Installing on another Mac

The full guide is [DEPLOY.md](DEPLOY.md); it works for an AI agent too. In short:

1. Here: `npm run kit:mac` — `dist/kit/` gets the folder `Recallo-<version>` (DMGs for Apple Silicon and Intel, the upgrade script, a source archive, instructions) and its archive `Recallo-<version>.zip`, which is what you send. Upgrading an installed Recallo — `bash upgrade-mac.sh` from the kit, details in [UPGRADE.md](UPGRADE.md).
2. On the other Mac: open the DMG for its architecture (`uname -m`: `arm64` or `x86_64`) and drag Recallo into Applications. The app is not notarized by Apple: on first launch — right-click → Open, or System Settings → Privacy & Security → Open Anyway. Or build from source: `bash scripts/setup-mac.sh`.
3. Through an AI agent: unpack the kit, open the folder in the agent and paste the text from [AGENT_PROMPT.md](AGENT_PROMPT.md) — the agent installs Recallo per DEPLOY.md and connects MCP.
4. Words and progress (optional): on the old Mac — Settings → Backup → Create backup (or the latest automatic backup from `backups/`), on the new one — Restore from backup.

## API and MCP for agents

- Turned on in **Settings → Agent API** (off by default). REST API: `http://127.0.0.1:47821/api/v1`, the token is in Settings, the description is at `/api/v1/openapi.json`.
- The MCP server is built into the app. Connecting it to Claude Code (once):

```bash
claude mcp add --scope user recallo -e ELECTRON_RUN_AS_NODE=1 -- "/Applications/Recallo.app/Contents/MacOS/Recallo" "/Applications/Recallo.app/Contents/Resources/app.asar/out/mcp/index.cjs"
```

  The snippet for Claude Desktop is in Settings. The agent works while Recallo is open and the Agent API is on.

- AI help with cards goes through an agent: for example, "add boarding pass and jet lag with examples to the Travel and everyday life set" or "add examples to the cards of the Formal verbs set". The agent picks the meaning, 1–3 examples translated into the meaning's language and an emoji; Recallo adds the transcription and hides the word in examples by itself.

## Structure

```
src/
  shared/      types, the IPC contract, masking, pronunciation variants, the session timer
  main/
    db/        SQLite connection and migrations; the Db interface (types.ts) and the WebAssembly database for the phone (wasm.ts)
    domain/    cards, the FSRS scheduler, the study session — all business logic
    ipc.ts     the interface ↔ domain bridge, one error structure
    autoBackup.ts  the daily automatic backup into backups/
  preload/     the safe window.recallo bridge (contextIsolation + sandbox)
  renderer/    the React interface
  main/api/    the REST API for agents (node:http) and OpenAPI
  mcp/         the MCP server (stdio), built into out/mcp/index.cjs
  mobile/      Recallo: Mobile (D57): the window.recallo bridge → a Web Worker with the same core on SQLite WebAssembly
scripts/      import (DuoCards, sets), building, installing and upgrading on macOS (mac-app.mjs, setup-mac.sh, make-kit.sh, upgrade-mac.sh)
```

- Business rules live only in `src/main/domain`; the interface (through IPC), the REST API and MCP call the same layer.
- Card content (`cards`, `examples`), progress (`card_progress`) and history (`review_log`) are stored separately.
- The front side comes from main already without the studied expression; a grade is accepted only after the reveal and only once per presentation.
- The interface is in English; card content can be in any language.
