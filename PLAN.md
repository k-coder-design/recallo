# Plan: Recallo — a desktop app for remembering words (DuoCards-style)

Basis: `duocards_requirements.md` (from 5.10.2026). Plan date: 23.10.2026. Status: under review.

## 1. Decisions made

| # | Question (section 12) | Decision | Source |
| --- | --- | --- | --- |
| D1 | Platform | Desktop on Electron (macOS/Windows): React + TypeScript | user |
| D2 | Voice checking | ~~Moved to the **second stage**~~ — cancelled on 24.10.2026 (D45 in ROADMAP). In v1 the data model and the speech service adapter are already ready for full pronunciation scoring (section 6) | user |
| D3 | Speech service | The choice is moved to the second stage (candidate: Azure Speech Pronunciation Assessment) | user |
| D4 | API for the agent | Local REST on `127.0.0.1`, bearer token, OpenAPI 3; plus an MCP server on top of REST (D25 in ROADMAP) | user |
| D5 | Extra v1 features | Undo the last grade; CSV/JSON import/export; duplicate warning | user |
| D6 | Accounts and sync | One local user, no sync | assumption |
| D7 | Card and sets | A card belongs to at most one set | assumption (section 10.1) |
| D8 | Example required | An example is optional | assumption |
| D9 | Scheduler | `ts-fsrs`. "Forgot" → Again, "Remembered" → Good. Relearning steps 1 min → 10 min, configurable | assumption (sections 10.2–10.3) |
| D10 | Storage | SQLite (better-sqlite3) in the user data folder | assumption |
| D11 | Speech | OS system voices (speechSynthesis); the language comes from the card's space (en-US / es-ES) | assumption |
| D12 | Swipes | Dragging the card with mouse/trackpad + buttons + ←/→ keys, Space — flip | assumption (GEN-01 for desktop) |
| D13 | Not in v1 | Daily new-card limit, written answers, reverse direction, pausing a card, regional variants; AI generation moved to phase MVP-6 (D26 in ROADMAP) | user / section 11 |

## 2. Architecture

- **Electron main process**: the domain layer (cards, sets, scheduler, queue), SQLite, the REST server (Fastify). The interface and the API use the same domain layer, so the rules are the same (API-10).
- **renderer (React)**: the interface, talks to main through typed IPC.
- **Data model** (content, progress, history and pronunciation are stored separately, GEN-06):
  - `cards`: id (UUID), space, term, meaning, set_id?, version, timestamps;
  - `examples`: card_id, text, translation?, mask_fragments[];
  - `sets`: id, space, name, description, version;
  - `card_state`: FSRS state (stability, difficulty, due, state, step);
  - `review_log`: id, card_id, rating, source (manual/voice), idempotency_key, created_at, undone;
  - `voice_attempts`: groundwork for stage 2 (correctness and pronunciation separately);
  - `idempotency_keys`: for the API.
- **Masking**: automatic search for the expression in all occurrences ignoring case, plus explicit fragments per example (CARD-07…09). A warning if the meaning contains the answer.

## 3. Stages

1. **Skeleton**: Electron + Vite + React + TS, SQLite and migrations, the domain layer, tests (Vitest).
2. **Content**: EN/ES spaces, sets and cards (CRUD), "No set", moving cards, deleting a set (3 options + a counter), masking, search, duplicate warning.
3. **Study**: choosing the scope (a set / the whole language), front and back sides, swipe and buttons, FSRS, the queue (overdue first, shuffling after a mistake, no endless loop), "to review / new" counters, an idempotent grade, undoing the last grade.
4. **Speech** for the reference on the back side.
5. **REST API**: all operations from 8.1, a token, OpenAPI with examples, `Idempotency-Key`, version protection (`If-Match`/`version` → 409), bulk operations with a result per item, an explicit set deletion policy, a single error structure, masking data.
6. **Import/export** CSV/JSON (with a report on duplicates and errors).
7. **Acceptance**: automated tests for the section 13 criteria (except voice ones, items 6 and 8 move to stage 2), a `.dmg` build.

**Stage 2 (later)**: choosing a speech service, recording, scoring correctness and pronunciation, the rules from table 6.2, retries without growing the interval, a notice about sending audio, the key in Keychain.
