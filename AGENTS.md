# Recallo — notes for AI agents

A macOS desktop app (Electron + React + SQLite) for remembering English and Spanish words. Overview — [README.md](README.md), phases and decisions — [ROADMAP.md](ROADMAP.md).

## Install on this Mac

Follow [DEPLOY.md](DEPLOY.md). In short: from a DMG — "Option A"; from source — `bash scripts/setup-mac.sh` (needs Node.js 22+). Check: `defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString`.

## Commands

- `npm ci` — dependencies (the `better-sqlite3` module is rebuilt for Electron automatically).
- `npm run typecheck`, `npm test` — checks; tests run through Electron in Node mode. Core tests run on two databases: the `mac` project (better-sqlite3) and `phone` (SQLite WebAssembly).
- `npm run build:mobile` / `npm run dev:mobile` — Recallo: Mobile for iPhone (D57, stages W0–W5 in ROADMAP.md). The core reaches the database only through the `Db` interface in `src/main/db/types.ts` — do not use better-sqlite3 APIs beyond it in the domain.
- `npm run dev` — run for development; a separate data folder: `RECALLO_USER_DATA=/tmp/recallo npm run dev`.
- `npm run install:mac` — build and install into /Applications. Recallo must be closed: check with `node scripts/mac-app.mjs running` (exit code 0 — open); if it is open, the install refuses by itself.
- `npm run kit:mac` — a kit for another Mac: the folder `dist/kit/Recallo-<version>/` and its `.zip` for sending. Upgrading an installed Recallo — `upgrade-mac.sh` from the kit, see [UPGRADE.md](UPGRADE.md).

## Rules

- User data — `~/Library/Application Support/Recallo/recallo.sqlite`. Before any change to real data, make a copy: `sqlite3 <db> ".backup <copy>"`. Change cards through Recallo's MCP or REST API, not SQL — that keeps the checks and does not touch progress.
- Close and reinstall the running app only with the user's consent.
- Everything in the repository is in English: the interface, docs, code comments and test names. Cyrillic appears only where the app must handle Russian text (the user's meanings are Russian): test data for Russian search, emoji and import, the Russian stop words, and the user's word sets in `data/sets/`. Mark each such place with an English comment.
- After user-visible changes, update README.md (features, version) and ROADMAP.md (phase result, decision Dnn).
- Business rules live only in `src/main/domain`; the interface, the REST API and MCP call the same layer.
