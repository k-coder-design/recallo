# Roadmap

Basis: [PLAN.md](PLAN.md) (decisions D1–D13) and `duocards_requirements.md`.
Every phase is a working app you can use; the next phase extends the previous one without reworking the data.

| Phase | Name | Status |
| --- | --- | --- |
| MVP-1 | Manual study | done (23.10.2026) |
| MVP-2 | Sets and convenience | done (24.10.2026) |
| MVP-3 | API and MCP server for agents | done (24.10.2026) |
| MVP-4 | Data transfer and release | done (24.10.2026) |
| — | "Surf" design, "Today's swell", timed sessions | done, installed as 0.5.0 (24.10.2026) |
| — | Two Spanish pronunciations | done, installed as 0.5.1; text cleanup for speech — 0.5.3 (24.10.2026) |
| ~~MVP-5~~ | ~~Voice answer and pronunciation~~ | cancelled (24.10.2026, D45) |
| ~~MVP-6~~ | ~~AI generation of card content~~ | cancelled (24.10.2026, D46): MCP is enough; the rule for examples in MCP — version 0.5.2 |
| MVP-7 | Daily new-word limit | done, installed as 0.6.0 (24.10.2026) |
| — | Compact Study screen and theme choice | done, installed as 0.6.1 (24.10.2026) |
| MVP-8 | Typed answer mode | done, installed as 0.7.0 (27.10.2026) |
| MVP-9 | Automatic backup | done, installed as 0.8.0 (27.10.2026) |
| — | Examples for 6 cards via MCP | done (27.10.2026) |
| — | A kit for installing on another Mac | done (29.10.2026) |
| — | First meeting with a word, card flip, optimization | done, installed as 0.9.0 (29.10.2026) |
| — | Card change animation after a new word | done, installed as 0.9.1 (29.10.2026) |
| — | Upgrading from older versions and the kit as one folder | done (29.10.2026) |
| — | Search and filter in Cards, delete in Study | done, installed as 0.10.0 (30.10.2026) |
| — | Fix: a multi-character emoji overlapped the word | done, version 0.10.1 (01.11.2026) |
| — | Fix: Cards buttons shrank with a long set name | done, version 0.10.2 (01.11.2026) |
| — | A choice after the new-word limit, new words mixed in | done, version 0.11.0 (01.11.2026) |
| — | Compact Study session bar | done, version 0.11.1 (01.11.2026) |
| — | Tooltips on icon buttons in Study | done, version 0.11.2 (01.11.2026) |
| M-W0…W5 | Recallo: Mobile — the iPhone web app | done, published at https://k-coder-design.github.io/recallo/ (01.11.2026) |
| — | iPhone fixes: surf icon, full screen, updates, Mexican stand-in voice | done, published (02.11.2026) |
| — | Everything in the repository in English | done (02.11.2026) |

## MVP-1. Manual study

Goal: you can add English and Spanish cards and study them with spaced repetition.

- Skeleton: Electron + Vite + React + TypeScript, SQLite with migrations, the domain layer in the main process, typed IPC.
- EN/ES language spaces, switching without losing progress (LANG-01…04, 06).
- Cards: create, view, edit, delete; several examples with translations; stable UUIDs; overwrite protection by `version` (CARD-01…04, API-15 at the domain level).
- Explicit progress reset when editing (CARD-05).
- Masking: all occurrences of the expression, simple word forms, explicit fragments for changed forms, a preview and a warning in the editor (CARD-06…10).
- Study session: front/back side, mouse swipe, buttons, ←/→/Space keys, a grade only after the reveal (LEARN-01…09; the scope — all cards of the language).
- FSRS (`ts-fsrs`), steps 1 min → 10 min, overdue before new, a repeat after a mistake with other cards in between, no endless loop (SRS-01…11, 13).
- Idempotent grading: resubmitting does not create a second result (LEARN-10, GEN-03).
- "To review / new" counters (GEN-05).
- Speaking the reference on the back side with OS voices (CARD-12, 13).
- Tests: masking, scheduler, queue, idempotency, separate languages.

Section 13 acceptance criteria: 1, 2, 3, 7, 9, 12 (for grades).

Result: 30 automated tests (masking, cards, session) and an end-to-end scenario in the built app pass.
Not checked: speaking aloud (the button calls OS voices; sound was not checked automatically).

## MVP-2. Sets and convenience

- Sets: create, rename, description, delete; "No set"; moving cards (SET-01…07).
- Deleting a set: "Keep cards / Delete with cards (with the count) / Cancel" (SET-08…10).
- Studying a single set with a shared progress (LEARN-01, SRS-09).
- Search by word, meaning, set (API-02 in the interface).
- Duplicate warning on creation.
- Undo the last grade.
- A hint to clarify the definition for often forgotten cards (SRS-12).
- **The first set — "Movie"** (English, words to describe films) from [data/sets/movie.json](data/sets/movie.json): 17 words from the Quizlet set "movie" (PDF from 23.10.2026). The duplicate with existing cards (`overrated`) is already removed; check duplicates again right before importing — new cards may have appeared since. The words have no examples: when creating the set, pick emoji and, if possible, add examples (or leave it until MVP-6). Decision D32.

Acceptance criteria: 4, 5, 10.

Result: sets (Cards: a sidebar, moving, editing, deleting with three options and a second confirmation), studying by set, search (including Cyrillic ignoring case), a duplicate warning linking to the existing card, undoing the last grade (Undo / ⌘Z), a hint to clarify the definition after 3 forgets; the "Movie" set is loaded (17 cards with examples and emoji, `npm run import:set`). 117 automated tests and two end-to-end scenarios (28 checks) pass. The app is built as `Recallo.app` and installed into Applications (D34).

## MVP-3. API and MCP server for agents

Goal: agents (Claude Desktop, Claude Code and others) read and grow the dictionary right from the conversation, without manual HTTP requests.

**REST API**

- Local REST (Fastify) on `127.0.0.1`, a bearer token from settings (API-08).
- All operations from 8.1, bulk creation and update with a result per item (API-01…07, 13).
- OpenAPI with examples (API-09), one error structure (API-12).
- `Idempotency-Key` (API-14), `If-Match`/`version` → 409 (API-15).
- An explicit set deletion policy; a request without it is rejected (SET-11).
- Masking data in responses (API-18); the agent does not need history or audio (API-17).

**MCP server** (D25)

- A separate local MCP server (stdio) on top of the same REST API: the same checks, token and business rules (API-10), no separate logic and no direct database access.
- Tools: card search, the list of languages and sets, adding words (one and in batches, with a result per item and a duplicate warning), editing a card, moving to a set, deleting a set with an explicit policy (SET-11).
- An agent repeating a call does not create duplicates: tools pass an idempotency key to the API (API-14).
- If the app is not running, a tool returns a clear error ("Open Recallo and try again") instead of crashing.
- The app settings have the token and a ready configuration snippet for connecting Claude Desktop and Claude Code.
- An example scenario: "add the words from this text to Recallo" → the agent creates cards with examples, and the app fills in transcription and masking.

Acceptance criteria: 11, 12 (for creation); through MCP the agent adds, finds and edits cards, and a repeated call creates no duplicates.

Result: a REST API on `node:http` (D35) with a token, a Host check, no CORS, idempotency, version protection, bulk operations and OpenAPI 3.1; an MCP server with 10 tools inside Recallo.app (D36); a Settings tab with a switch, port, token and instructions. 139 automated tests (including the API over HTTP and MCP over its protocol) and three end-to-end scenarios pass; MCP was checked from the installed app over stdio. Recallo is connected to the user's Claude Code (`claude mcp add --scope user`, "✔ Connected"); the Agent API is on by the user's decision.

## MVP-4. Data transfer and release

- CSV and JSON import/export with a report on errors and duplicates.
- Section 13 acceptance tests, a `.dmg` build for distribution. The icon and the local `Recallo.app` build were done earlier, in MVP-2 (D34).

Result: import (Recallo CSV/JSON, DuoCards export, Quizlet/two columns) with format auto-detection, a "new / duplicates / errors" preview, a column swap and a set choice; dictionary export to CSV (Excel/Numbers) and JSON; a full backup with progress and history, and restore (the current database is saved before replacing). Section 13 acceptance tests — `src/acceptance.test.ts` (criteria 1–5, 7, 9–12 pass; 6 and 8 wait for MVP-5). A `.dmg` for Apple Silicon: `npm run release:mac` → `dist/Recallo-0.4.0-arm64.dmg` (D39). 160 automated tests and four end-to-end scenarios (45 checks) pass.

## "Surf" design and timed sessions, version 0.5.0

Learning as surfing: the more steadily you study, the higher the wave you can ride. Two references are combined: the calm coastal palette for study screens and a retro poster's typography with coral accents for headings, buttons and achievements (D41).

- A new theme: cream "sand", turquoise water, coral accents, Futura uppercase headings, a top bar with a wavy edge. Light and dark theme; chart colors checked with a palette validator, text contrast at least 4.7:1.
- **Today's swell** on Study, in the session summary and in Stats: the wave height in meters (0.3–4.0) labelled from Flat to Overhead, an illustration whose wave height depends on the swell, and a hint on how to grow: "Paddle out today → 2.1 m" / "Come back tomorrow → 2.0 m". The formula — D40. The FSRS schedule does not change.
- The metaphor in the copy: the "Paddle out" button, "waves to ride" (to review) and "calm water" (new), word stages in Stats: calm water → ripples → small waves → rolling waves → big waves.

- **Timed sessions** (D43): before starting you choose the length — No limit, 5, 10 or 15 minutes (the choice is remembered). During the session a countdown is visible. When time is up, the current card is finished up to its grade ("Last card"), then a "Time's up" screen with a summary and "Extend by 5 / 10 / 15 min" and "Finish"; the last answer can be undone there too. If at that moment we are waiting for a short review, the summary shows right away. Progress is saved as usual.

Result: 170 automated tests and five end-to-end scenarios (58 checks) pass. Installed in /Applications as 0.5.0; the database copy before installing — `recallo.before-surf.sqlite`.

## Two Spanish pronunciations (0.5.1)

Problem: Spanish speech sounded Castilian — macOS had no Argentine voice installed, and the app took the first Spanish voice it found (Eddy, Spain). The transcription was already Argentine.

- Spanish cards have two variants: 🇦🇷 Argentina (primary: [ʃ] for ll/y, [s] for c/z) and 🇪🇸 Spain ([ʝ] for ll/y, [θ] for c/z). Both transcriptions are built automatically, editable in the editor, and each plays with its own voice (D44).
- Voice choice: the exact region first, then nearby ones (for Argentina — Latin American, not Spain), regular voices before robotic ones. This also fixed English: Samantha plays instead of the novelty voice Albert.
- Settings → Voices: which voice plays for each variant, a listen button, and how to install a missing one (Argentine — Diego in Spoken Content → Manage Voices).
- The second variant goes through the REST API, MCP, import and export (CSV column `transcription_alt`).
- A fix after checking (D47): voices read symbols aloud ("¿" as "question mark"). Before speaking the text is cleaned up: no ¿ and ¡, " / " between variants becomes a pause, a slash inside a phrase becomes "or"/"o", sth/sb become something/somebody. In Spanish the listen button was shown only for the variant with its own voice in macOS (at the time 🇪🇸 Spain); 🇦🇷 would get it once the Diego voice was installed.
- 27.10.2026: the user installed Argentine voices (Diego, Diego (Enhanced), Isabela) — the 🔊 button for 🇦🇷 came back. Among voices of one region Premium is chosen first, then Enhanced, then regular (🇦🇷 — Diego (Enhanced)); the voice list is re-read when returning to the Recallo window.

Result: 181 automated tests and six end-to-end scenarios (65 checks) pass.

## ~~MVP-5. Voice answer and pronunciation~~ — cancelled

Cancelled by the user's decision on 24.10.2026 (D45): a voice answer and pronunciation scoring are not needed. Speaking words with system voices (CARD-12, 13; D44) stays. Below is the original plan, for history.

- Choosing a service (candidate Azure Pronunciation Assessment), the key in Keychain, a notice about sending audio (VOICE-17…19).
- Recording, recognition, separate pronunciation scoring, the rules of table 6.2 (VOICE-01…16).
- Repeating the pronunciation without growing the interval again; a service error does not count as "Forgot".

Acceptance criteria: 6, 8.

## ~~MVP-6. AI generation of card content~~ — cancelled

Cancelled by the user's decision on 24.10.2026 (D46): Claude creates cards with meanings and examples through MCP (MVP-3), so a separate button in the editor is not needed. One rule from the plan is kept — example translations are in the meaning's language; it was added to the MCP tool descriptions. Below is the original plan, for history.

Goal: create cards faster — for a word, AI suggests the content, and the user checks and edits it (requirements section 11: "AI preparation of definitions and examples"). D26.

- A "Suggest with AI" button in the card editor: for a word (and the space's language) AI suggests:
  - **the meaning** — in the user's chosen language: English, Russian or Spanish. The language is chosen in the editor; by default the last one used for this space (the setting is remembered);
  - **usage examples** (1–3) where the expression is used naturally; for changed forms AI also gives the fragments to hide (CARD-09);
  - **example translations**;
  - **an emoji association** — more accurate than the offline pick from D27; it replaces only automatically picked emoji and does not touch the user's choice (`emoji_auto`).
- Nothing is saved by itself: the suggestion fills the editor fields as a draft; the user edits and taps Save (the same checks as manual input, API-10). A field can be accepted partly, or another variant requested.
- Editor warnings also work for the suggested text: the meaning must not contain the expression itself (section 3.2), and the expression must be in every example.
- The AI provider key is stored in Keychain and used only in the main process; it never reaches the interface or API responses (like VOICE-19). Before the first request — a notice that the word is sent to an external service.
- An error or unavailability of the service does not block manual input (like GEN-04).
- Agents can create cards themselves through MCP (MVP-3) — generation in the editor is for the manual scenario.

Open questions before implementation: the provider and model (candidate — Claude API), cost and limits; which language to translate examples into if the meaning is in the studied language; whether batch generation is needed for existing cards without examples.

## MVP-7. Daily new-word limit

Goal: an even load. There was no limit: meeting 30–40 words at once piles up a big review queue a couple of days later. Requested on 24.10.2026.

- A setting in Settings → Study: "New words per day" for each language separately, 10 by default; 0 — reviews only, no new words.
- The limit counts meetings during today (local time) across the whole language — regardless of which set is chosen for study. Undoing a meeting (⌘Z) returns the word to the limit.
- Reviews are not limited: "To review" cards are always shown.
- Study: the "New" counter shows how many new words are left for today (no more than the limit), next to it — "4 of 10 new words today". When the limit is reached but new words remain — a message and a "Learn 5 more today" button (a one-off increase for today only).
- Today's swell and the timer do not change; FSRS does not change.
- The API and MCP are not affected by the limit: it applies to study only.

Done criteria: with a limit of 10, after 10 meetings the session shows only reviews; "Learn 5 more" adds exactly 5; undoing a meeting returns 1 to the limit; the next day the limit is 10 again; English and Spanish limits are independent.

Result (24.10.2026): all as planned (D48). Settings → Study — a "new words per day" field for English and Spanish with a "Today: N of M met" counter. Study — "N of M new words today" under the counters; when the limit is reached, a block with the number of waiting words and a "Learn 5 more today" button — on the start screen, the waiting screen and in "All caught up". A word whose meeting was postponed ("Not yet") takes a place in the limit and continues even when the limit is reached. 199 automated tests and seven end-to-end scenarios (76 checks) pass.

## Compact Study screen and theme choice

Requested on 24.10.2026 after installing 0.6.0: the Study start screen looked messy and took too much room; a light/dark theme choice was needed.

- The Study start screen: under today's swell — one session setup card. The "To review" and "New" counters in one row, labels to the right of the numbers; the new-word limit in one line ("Daily limit reached · 14 met today, 163 waiting" + "Learn 5 more today"); "Study" and "Length" side by side in one row (stacked in a narrow window); a wide "Paddle out" button at the bottom of the card. The same limit line is on the waiting screen and in "All caught up".
- Settings → Appearance: System / Light / Dark (System by default — follows macOS). The theme applies to the whole app right away and is saved (D49).

Result: 200 automated tests and eight end-to-end scenarios (81 checks) pass.

## MVP-8. Typed answer mode

Goal: check memory more precisely than self-grading — the word has to be typed. Requested on 24.10.2026.

- Before starting a session you choose the answer mode: "Self-check" (as before) or "Type the answer"; the choice is remembered. Meeting new words (intro) does not change — typing is only for recall.
- The recall front is as before, plus an input field; Enter — check. Empty input = "Don't remember" (shows the answer, suggests "Forgot").
- The comparison forgives: case, accents and diacritics (corazon = corazón), the signs ¿ ¡ ? ! and extra spaces, a leading to / a / an / the; with variants split by " / " any one fits. A one-letter typo in a word of 5+ letters counts as a correct answer with the note "almost — check the spelling".
- After the check the card's back is shown, the typed text with the differences highlighted, and the app's verdict.
- **The user always decides, either way**: the app suggests a grade, but it can be changed before moving to the next card.
  - Verdict "correct" → the main button "Remembered", next to it "Count as forgot" (e.g. a lucky guess or a peek).
  - Verdict "wrong" → the main button "Forgot", next to it "I was right" (a synonym, an acceptable spelling, a typo the app did not forgive).
  - Keys: Enter — accept the verdict, ← / → — choose a grade explicitly, as in normal mode; swipe works the same.
- Only the final grade goes to FSRS. The answer history also stores the typed text, the app's verdict and a manual-override flag — to see where the check is wrong and improve the comparison. Migration: new columns `review_log.typed_answer`, `auto_verdict`, `overridden`.
- Undo (⌘Z), the timer and today's swell work as usual. Stats: the share of manually overridden answers is not shown (service data).

Done criteria: each of the cases "correct / almost / wrong / empty" gives the expected verdict; an override either way saves exactly the chosen grade and changes the interval accordingly; pressing again does not create a second grade.

Result (27.10.2026): done as planned (D50). The Study start screen — an "Answer: Self-check / Type" switch (remembered). In recall in Type mode, an input field under the card has focus; Enter — check, empty input — "don't remember". After the check — the card's back, the verdict (Correct / Almost — check the spelling / Not quite / No answer) and the input with highlighting: a close answer — character by character (extra struck through, missing underlined), a completely different one — struck through whole. Buttons: the suggested grade large with an Enter hint, the opposite next to it ("I was right" / "Count as forgot"); ← / → and swipe work too. The comparison was checked on all 203 cards: exact input of each one counts. History stores `typed_answer`, `auto_verdict`, `overridden` (migration 8). 227 automated tests and nine end-to-end scenarios (90 checks) pass.

## MVP-9. Automatic backup

Goal: never lose data, even if you forget to make a backup by hand. Requested on 24.10.2026.

- Once a day — at the first Recallo launch of the day (or at midnight if the app is open) — a full backup is saved in the Settings → Backup format (cards, sets, progress, history). Folder: `~/Library/Application Support/Recallo/backups/`, name `Recallo backup YYYY-MM-DD.json`.
- The 7 most recent daily backups are kept, plus one for each of the last 4 weeks; older ones are deleted automatically.
- Settings → Backup: a "Back up automatically every day" switch (on by default), the time of the last backup, a "Show backups in Finder" button. Restoring — with the existing "Restore from backup…" button.
- A backup failure (no disk space etc.) does not get in the way: Settings shows the error and the time of the last successful backup.
- Manual copies before installs (`recallo.before-*.sqlite`) stay as they are.

Done criteria: a backup is created once a day; it restores through Restore without loss; rotation leaves 7 + 4 files; a disabled switch stops the backups.

Result (27.10.2026): done as planned (D51). A backup at launch plus a check once an hour (so it also appears after midnight if Recallo is open). Settings → Backup: a "Back up automatically every day" switch, the time of the last backup and the number kept, "Show backups in Finder"; on failure — the error text and the time of the last successful backup. The "Restore from backup…" dialog opens right in the automatic backups folder. Rotation only touches `Recallo backup YYYY-MM-DD.json` files. 233 automated tests and ten end-to-end scenarios (97 checks) pass.

## Examples for 6 cards via MCP (no code changes)

Six cards have no examples, so the recall front has no sentence with a gap:
- English: "be a recipe for disaster, trouble, success, etc." (Decisions and risks), "in the best light", "innocuous habits" (Describing words);
- Spanish: "¿Como te va? / ¿Qué tal?", "¿Cómo te llamás?", "¡Chau!" (Greetings).

To do: in a Claude session with the Recallo MCP connected, ask "add 1–3 examples to the cards without examples" — the agent finds them with `search_cards` and adds examples with `update_card` (translation in the meaning's language, D46). For Spanish — conversational examples in the Argentine variant (vos). Card progress does not change.

Result (27.10.2026): through MCP (`update_card`) 2 examples were added to each of the 6 cards; the word is hidden in all of them (for "be a recipe for …" — explicit fragments "is/are a recipe for …"). Translations are in the meaning's language: Russian for "in the best light", English for the Spanish cards; English cards with an English meaning have no translation. The Spanish examples are rioplatense (vos, laburo, finde, copado). Progress did not change; no cards without examples remain. The database copy before the change — `recallo.before-examples.sqlite`.

## A kit for installing on another Mac

Requested on 29.10.2026: files to set the app up on another Mac, including by an AI agent.

- `npm run kit:mac` → `dist/kit/`: DMGs for Apple Silicon (`arm64`) and Intel (`x64`), a source archive without `node_modules` and service folders, DEPLOY.md, SHA256SUMS.txt (D52).
- [DEPLOY.md](DEPLOY.md) — step by step: DMG (by hand and with commands), building from source with one command `bash scripts/setup-mac.sh`, checking, moving words (Restore or copying the database), connecting Claude over MCP, voices, upgrading and removing.
- [AGENTS.md](AGENTS.md) (and `CLAUDE.md`, which includes it) — project commands and rules for agents. The requirements `duocards_requirements.md` are now in the project.
- The build scripts are no longer tied to `dist/mac-arm64`: `scripts/mac-app.mjs` finds the built app for any architecture, signs and installs it; the install refuses if Recallo is open (MCP server processes do not count).

Checked: from the archive in a clean folder `setup-mac.sh` installs dependencies, passes typecheck and 236 tests and builds the app; the app built from the archive and the one installed from the DMG both launch; the DMG has the right architecture, the ad-hoc signature passes verification, the minimum macOS is 13. The Intel build was checked only by its contents: this Mac has no Rosetta.

## First meeting with a word, card flip, optimization (0.9.0)

Requested on 29.10.2026: speed the app up; at the first meeting with a word show the whole card right away and make it clear it is an introduction — without "remembered / forgot"; animate the card flip.

- **Introduction** (D53): a new word's card comes from `study.next` whole (word, pronunciation, meaning, examples with the word highlighted) and already revealed. A turquoise frame and the label "✨ New word · first meeting", one "Continue" button (Space / Enter / →, swipe either way); ← does nothing. Recall a minute later — as before. The "Not yet" button is removed from the interface; the domain still accepts "forgot" for an introduction.
- **Flip**: on "Show answer" and on checking a typed answer the card turns edge-on (180 ms) while the main process prepares the back, then turns the rest of the way showing the back (260 ms). With "Reduce motion" in macOS there is no animation.
- **Optimization**: prepared SQL statements are cached (before, they were parsed again on every call); `synchronous = NORMAL` in WAL mode — writing a grade does not wait for fsync; an introduction has no separate `study.reveal` request; the Study badge takes the counters from the `study.next` response instead of a second request; a swipe moves the card directly in the DOM without re-rendering on every move; the timer countdown re-renders only itself, not the card; the voice choice for speech (sorting all system voices) is computed once, not on every render.

Result (29.10.2026): 238 automated tests pass. In the built app on a database copy checked: a new word shows whole with the label and the Continue button, ← does not grade, Space moves on and counts the introduction; the flip on "Show answer" is visible mid-animation, the back shows fully.

## Card change animation after a new word (0.9.1)

Requested on 29.10.2026: animate the transitions "new word → new word" and "new word → not new".

- A read new word leaves the table (200 ms): on Continue, Space, Enter and → — to the left, on a swipe — in the swipe's direction, continuing from where the card was released (before, a swiped card first returned to the centre). Recording the introduction runs in parallel, so the transition is at most 200 ms slower than before.
- The next new word is "dealt" from the right, as from a deck (280 ms); a recall rises from below with a slight tilt (320 ms) — you can see the check is starting.
- Transitions after a recall did not change. With "Reduce motion" in macOS there are no animations, and no pauses either.

Result (29.10.2026): 238 automated tests pass. In the built app on a database copy checked: swiping a new word right — it leaves to the right from the release point and the next new word appears from the right; Space on a new word when a recall is ready — it leaves to the left and the recall card rises.

## Upgrading from older versions and the kit as one folder

Requested on 29.10.2026: a guide and tools for moving from versions before 0.9.0 to the latest; the kit — one folder that can be sent to others.

- [UPGRADE.md](UPGRADE.md): what changed in 0.9.x, what happens to the database when upgrading from each version (0.4.0–0.5.0 → migrations 7–8, 0.5.1–0.6.1 → migration 8, 0.7.0–0.8.x → no changes), upgrading by script and by hand, checking, rolling back.
- `scripts/upgrade-mac.sh` (in the kit — `upgrade-mac.sh`): picks the DMG for the architecture and checks its checksum, compares versions (the same or newer — does nothing, `--force` — reinstall), refuses to work while Recallo is open (MCP processes do not count), makes and verifies a database copy `recallo.before-<version>.sqlite` (one file, without -wal), replaces the app and checks the version. Paths can be overridden with `RECALLO_APPS_DIR` and `RECALLO_DATA_DIR` — for testing on copies.
- `AGENT_PROMPT.md`: two prompts — "New install" and "Upgrade" (the agent closes Recallo only with consent and does not touch the data by hand).
- The kit — one folder `dist/kit/Recallo-<version>/` with `START_HERE.md` (what to open in each case) and its archive `dist/kit/Recallo-<version>.zip` for sending.

Result (29.10.2026): the script was checked on copies in a separate folder: upgrading from 0.8.0 to 0.9.1 with a database copy (313 cards), running it again changes nothing, with the app open — a refusal without changes.

## Search and filter in Cards, delete in Study (0.10.0)

Requested on 30.10.2026: search in Cards finds only the whole word; a filter by word status is needed; in Study a card can be edited but not deleted.

A check on a database copy showed that part of a word ("char", "ostens", the start of a Russian meaning) was already found before. Not found were: phrase words out of order ("hold at bay" for "hold/keep sth (sb) at bay"), typos, text from examples; and a short query listed the wanted word among matches in meanings in the order they were added.

- **Search** (D54): every query word must be found in the card's word, meaning, examples with translations or the set name; ignoring case, diacritics and punctuation; one typo is forgiven in words of 5+ letters; queries of 1–2 letters match only word beginnings. Order: a match with the whole card word first, then word, meaning, examples and set; inside a field — whole word, beginning, part, typo. The REST API (`GET /cards?search=`) and MCP (`search_cards`) get the same search.
- **Status filter**: All / New / Introduced / Learning / Review / Relearning buttons under the search with the number of cards in the current scope and search, colours as the status badges in the list; pressing again clears the filter. The status is computed by one function `shared/cardStatus.ts` for both the badge and the filter.
- **Delete in Study**: a bin in the card's corner (next to the pencil, if there is one), a confirmation as in Cards, then the next card. On the recall front the dialog does not name the word, so as not to give the answer away. If the card with the last grade is deleted, the Undo button hides — there is nothing to undo.

Result (30.10.2026): 244 automated tests pass. In the built app on a database copy checked: "ostensably", "hold bay", "keep at bay" find their cards; the Review filter leaves only Review cards and clears on a second press; delete in Study — Esc closes the dialog without ending the session, Delete deletes the card (313 → 312) and shows the next one.

## Fix: multi-character emoji (0.10.1)

Noticed on 01.11.2026: in the Cards list the emoji "👨‍👩" of "el padre / la madre" overlapped the word. Such an emoji is two figures joined by an invisible character; macOS has no single picture for the pair, so two are drawn. The emoji space was fixed (1.5em in the list, a 92 px circle on the Study card, a 64 px square in the editor).

Now the space grows with the content: in the list — from 1.5em, the circle on the card stretches into an oval, the frame in the editor — sideways. A single emoji looks as before. Checked in the built app on a database copy: the list (the emoji ends before the word starts), the editor and the Study card.

## Fix: Cards buttons with a long set name (0.10.2)

Noticed on 01.11.2026: in the Cards header the Edit set, Delete set, Import, Export and + New card buttons shrank when the set name was long (for example, "Life choices and turning points") — the title and the buttons shared one row.

Now the buttons do not shrink or wrap their labels; a long set name wraps over several lines, and if there is still not enough room, the button row moves under the title. Checked on a page with the real styles at window widths of 800 and 1280 px: with a short and a long name all buttons have the same size (Edit set 87×41, + New card 114×41).

## A choice after the new-word limit, new words mixed in (0.11.0)

Requested on 01.11.2026:
1. When the daily new-word limit ran out mid-session while the timer was still running, Study showed "Next review in…" and waited. A simple choice of two is needed: study the current cards or the next new ones.
2. When studying a new set, new words came one after another (the recall of the first opened only a minute later) — they need to be mixed with other cards of the set.

Done:
- The choice screen (D55): "Practice current words" — until the end of the session cards are shown without waiting for their due time, and early review alternates cards instead of showing one in a row; "Learn 5 new words" — a one-off +5 to the limit, like the former "Learn 5 more today" link. Ending the session — with the End session button in the header. If the limit is not reached, the wait is as before.
- New words mixed in (D56): Study tells `study.next` that the previous card was an introduction (`afterNew`), and then instead of the next new word another one is shown — an already introduced word ahead of time, and in a set also a learned word of the set closest to review. Without the flag the order is as before — agents through the API and MCP can introduce all new words in a row.

Result (01.11.2026): 248 automated tests pass (4 new: alternating early review, new → introduced → new, a learned set word between new ones, the old order without the flag). The choice panel was checked on a page with the real styles in the light and dark themes; the whole scenario was not clicked through in the built app.

## Compact Study session bar (0.11.1)

Noticed on 01.11.2026: in the Study header with a long set name the "↶ Undo" and "End session" buttons wrapped their labels onto two lines, the timer turned into a circle, and the counters "New words: 0 · Remembered: 0 · Forgot: 1" took two lines. The Study column is narrow (640 px), and everything shared one row.

Now the header is one row. On the left — the set name (a long one is cut with an ellipsis, the full one in a tooltip) and short coloured counters ✨ 0 · ✓ 12 · ✗ 1 (tooltips: New words met / Remembered / Forgot). On the right — a "pill" timer, undo as an icon button ↶ (tooltip Undo the last grade, ⌘Z) and End session (tooltip Esc). Header buttons are 32 px high, quieter than the main ones and do not wrap their labels. Checked on a page with the real styles: light and dark theme, normal width and a 440 px column — the buttons keep their size, the set name is cut.

Result (01.11.2026): 248 automated tests pass; the auto backup tests now delete their temporary folders.

## Tooltips on icon buttons in Study (0.11.2)

Requested on 01.11.2026: buttons in study mode need tooltips, but not buttons with text and not the 🔊 pronunciation; the ✨ · ✓ · ✗ counters do need them.

System `title` tooltips in the app appeared late or not at all. Now such elements have their own tooltip (the `data-tooltip` attribute, a rule in styles.css): a label under the element that appears after 0.25 seconds, also shown on keyboard focus. Tooltips: ↶ — Undo last answer · ⌘Z; ✎ — Edit card; 🗑 — Delete card; ✨ / ✓ / ✗ — New words met / Remembered / Forgot. The End session tooltip is removed; the 🔊 icon on the card has no tooltip. Checked on a page with the real styles in the dark theme.

## Recallo: Mobile — the iPhone web app (W0–W5)

Requested on 01.11.2026: Recallo on iPhone as a separate installation — the same screens and study rules, its own data, no sync with the Mac. Instead of MCP — importing a file an agent prepares; a backup — with a button.

Three paths were considered: a Home Screen web app, a Capacitor wrapper and a native Swift app. With a free Apple ID, apps from Xcode stop opening after 7 days, and the study rules in Swift would have to be kept as a second copy — the web app was chosen (D57).

The user's decisions: hosting — GitHub Pages; the phone gets a full copy from the Mac (words and progress); the project is "Recallo: Mobile", on the Home Screen — "Recallo".

Design:
- study rules — the same `src/main/domain` and `src/shared` without changes;
- database — SQLite compiled to WebAssembly, in a Web Worker, data in browser storage (OPFS), the same schema and migrations;
- interface — the same React screens; the `call()` function in the phone build sends the request to the Worker instead of Electron IPC;
- Mac only: MCP and Agent API, auto backup to a folder, file dialogs, `nativeTheme`. On the phone: import and restore through a file picker, "Backup" through the Share menu with a reminder about an old backup, icon tooltips — by a long press;
- offline — a service worker; a new version — an "Update ready" notice;
- iOS 17 and newer.

Stages:

| Stage | What is done | Done when |
| --- | --- | --- |
| W0 | A WebAssembly database behind the shared `Db` interface, the core in a Worker, the phone build | all automated tests pass on both databases; an empty app opens in Safari |
| W1 | Restoring a backup from the Mac, the import screen | 316 words and progress are visible on the phone |
| W2 | Study in the phone layout | a full session works on an iPhone screen |
| W3 | Cards, sets, Settings — and a phone-friendly view (see below) | everything from the Mac's Cards and Settings works on the phone, the Cards screen is easy with one hand |
| W4 | Backup, Export, offline, updates, Stats and today's swell | works in airplane mode; backup → restore checked |
| W5 | Publishing on GitHub Pages, installing on iPhone, a guide | Recallo on the Home Screen |

W1 result (01.11.2026):
- Picking a file on the phone — `openFile` in `src/mobile/files.ts`: a hidden file input, opened right from the tap (otherwise iOS does not show the picker), cancel — null, a 20 MB limit, as on the Mac. The bridge intercepts `transfer.openFile`, `transfer.backup` and `transfer.export` on the page; the backup and export contents are prepared by the core in the Worker (`phone.backupFile`, `phone.exportFile`), and the page saves them through the Share menu.
- Restoring on the phone — the same core `transfer.restore`. The phone does not copy the current database before restoring, so the confirmation on iPhone says: "To keep your current data, cancel and create a backup first". Settings on the phone has "Create backup…" and "Restore from backup…".
- Export in Cards on the phone saves the file through the Share menu; the dialog shows "Export file is ready." when the path is unknown.
- Checked in the browser pane at 430×932 with real actions in the interface (the file picker was replaced by the test — the pane cannot do the system picker): a full backup taken from a copy of the Mac database was restored — 316 cards (210 English, 106 Spanish), 19 sets, 249 answers, the set "Life choices and turning points" with 21 cards, 27 reviews and 20 started new words for today, today's swell 2.1 m. Importing a Recallo JSON file: a new word was added with an emoji, an example and a transcription into a new set from the file, a duplicate skipped. Exporting a set to CSV — 21 cards. The test word and set were deleted afterwards.
- Not checked: the system file picker and the Share menu on a real iPhone — that is W5.

W2 result (01.11.2026):
- The phone shell (`App.tsx`, class `.app.phone`): at the top — the logo and the language switch, the Study · Cards · Stats · Settings tabs at the bottom, with icons and a review badge, respecting the notch and the home indicator (safe-area). During a session (`.in-session`; Study reports it through `onSessionChange`) there is no header and no tabs: the session bar, the card and the answer buttons remain.
- Study on the phone: the answer buttons stick to the bottom of the screen (sticky) — a long card scrolls above them; "Forgot" and "Remembered" are two full-width 52 px buttons, without arrows; "Show answer" and "Continue" are full width. Key hints (Space, Enter, ← / →) and key icons are removed; hints talk about swiping. The typed-answer input is 16 px so iOS does not zoom the page. Icon button tooltips are not shown on a touch screen; the ✨ ✓ ✗ counters show theirs on tap.
- All phone rules are in a separate block at the end of styles.css under `.phone`; nothing changes on the Mac (checked: the build with the 'mac' flag at 1100×760 — tabs in the header, "← FORGOT", "REMEMBERED →", "CONTINUE →" with the Space icon, key hints).
- Checked at 430×932 on a copy of the Mac data: the start screen, a session (front, answer, grade, undo), a long card scrolls under the sticky buttons, ending the session brings back the header and tabs, typed-answer mode. Not yet checked in Safari (WebKit) or on a real iPhone — that is W5.

Improve the Cards view on the phone (requested on 01.11.2026, stage W3). For now on iPhone it is the Mac layout squeezed to the phone's width:
- the card row looks odd: "Delete" is just a text link next to the word, the status, due date and set choice crowd into one row;
- buttons and controls are placed inconveniently and look bad: Edit set / Delete set / Import / Export / + New card — a row of buttons above the list, search and the status filter take a lot of room;
- what to do: a two-level card row (word and meaning large, status and due date small below them), deleting and moving to a set — by swiping the row left or in a "…" menu, "+ New card" — a prominent button at the bottom of the screen under the thumb, set actions and Import/Export — in a "…" menu in the header, sets — a drop-down instead of the sidebar, the status filter — scrollable "pills" in one row, buttons and fields at least 44 pt.

W3 result (01.11.2026) — everything from the list above is done:
- Cards on the phone: instead of the sidebar — a set picker (All cards, No set, sets with card counts, "+ New set…") and a "⋯" button with the menu Edit set / Delete set / New set / Import cards / Export cards. The title and the button row above the list are not shown on the phone; the set description is under the picker.
- The card row has two levels: emoji and word large, the meaning below in two lines; on the right the status and due date, then "⋯" with a menu: set choice (move), Edit card, Delete card. Tapping the row opens the editor, as before.
- The status filter is one row that scrolls sideways. "+ New card" is a round button above the tabs.
- The action menu is a new component `components/ActionSheet.tsx` (like the iOS system menu: a list and a separate "Cancel"). All dialogs (card editor, sets, import, export, confirmations) on the phone are full-width bottom sheets with 48 px buttons at the bottom; dialogs and menus are above the tabs.
- Stats and Settings on the phone fit the width without changes (checked: the page does not scroll sideways).
- Cards on the Mac is as before (checked: the build with the 'mac' flag at 1100×700 — the sidebar, the Import / Export / + New card buttons, the set choice and Delete in the row).

W4 result (01.11.2026):
- Home Screen: `src/mobile/public/manifest.webmanifest` (Recallo, standalone, theme colours) and 180/192/512 px icons from the Mac icon (`build/icon.png`): the rounded square stretched over the whole canvas on top of the same gradient, without transparent margins (iOS rounds it itself). apple-mobile-web-app-* meta tags, the status bar over the app (safe-area insets are already there).
- Offline: at build time `vite.mobile.config.ts` writes `sw.js` with the list of all files; the cache is named by the hash of their contents. Cache lookups use ignoreVary: the server marks files "Vary: Origin", and without it the script was not found offline (found by testing).
- Updates: a new version downloads in the background and waits; at the bottom — "New version ready · Update", a tap reloads the app on the new version (`src/mobile/offline.ts`). A new version is checked for every time you return to the app. (Changed on 02.11.2026 — see "iPhone fixes" and D62.)
- Storage: at launch — `navigator.storage.persist()`.
- Backup reminder: the time of the last backup is in the device's localStorage (`lib/backupReminder.ts`); if there was no backup for 7 days, the Study start screen shows "Last backup 9 days ago… · Back up now"; Settings → Backup shows "Last backup: …".
- Checked at 430×932: 11 files in the cache; with the server stopped the app opens fully (210 cards, 15 reviews); "Update" moves to the new version keeping the data; "Back up now" offline saves a backup (580 KB) and removes the reminder.
- A deviation from the plan (D60): the pronunciation dictionary and emoji data are not split into a separate download — the core weighs 1.3 MB compressed (the whole app ~1.8 MB), downloads once and then lives in the cache.
- Noticed: the OPFS database (opfs-sahpool) is opened by one instance of the app; if Recallo is open in two tabs of one browser at once, the second does not get the database. On iPhone the Home Screen app is a single instance.

W5 result (01.11.2026):
- The project is a public repository https://github.com/k-coder-design/recallo (the user's choice: the whole source code). Before publishing all 144 files were reviewed: no personal data; `.claude/settings.local.json` (this Mac's paths) is in .gitignore. Commits are by k-coder-design with the GitHub noreply address, without personal email.
- Publishing — GitHub Actions (`.github/workflows/pages.yml`): on every push to main — `npm ci --ignore-scripts`, a type check of the phone build, `npm run build:mobile`, deploying dist/mobile to GitHub Pages. The Mac build is not part of CI. The run was repeated on a clean copy of the repository before publishing.
- Site: https://k-coder-design.github.io/recallo/ — files are served with the right types (including application/wasm), the app opens in the phone layout, the core responds, the service worker stores 11 files, no errors.
- Installing on iPhone — README, section "Recallo: Mobile on iPhone". On a real iPhone (Safari, the Share menu, the file picker, voices) the user checks.

A surf-style icon (01.11.2026): instead of the purple letter R — a word card on a curling wave at sunset (option B1 "Curl" of eight sketches, chosen by the user). The source is `build/icon-mobile.svg` (theme colours, a square without rounding); the 180/192/512 PNGs are drawn by `swift scripts/render-mobile-icons.swift` with the macOS system SVG engine. The Mac app keeps its old icon for now.

Checking: domain tests run on both databases, checks with the Safari engine (WebKit) at iPhone size, at W5 — on a real iPhone.

W0 result (01.11.2026):
- `src/main/db/types.ts` — the `Db` interface (prepare → get/all/run/pluck, transaction, pragma, exec) the core uses; better-sqlite3 implements it as is (`NativeDb` stays Mac-only: file backup, close). `createHandlers` takes the platform parts by shape (`AgentApi`, `Files`), not Electron classes.
- `src/main/db/wasm.ts` — a wrapper for SQLite WebAssembly (`@sqlite.org/sqlite-wasm` 3.53.4-build2): named parameters without a prefix, a statement cache with a pluck reset, SAVEPOINT for nested transactions, pragma with { simple }; the same migrations.
- Tests: the `mac` project — all 248 on better-sqlite3; the `phone` project — 171 on WebAssembly (all domain and `src/shared` tests plus 5 wrapper tests). The rest (agent API, MCP, auto backup, the better-sqlite3 cache) concern only the Mac.
- `src/mobile/` — `index.html`, the bridge `window.recallo` → Web Worker (`bridge.ts`), the core in the Worker on OPFS "opfs-sahpool" (`worker.ts`), `node:crypto` replaced by Web Crypto; the build `vite.mobile.config.ts` → `dist/mobile`. Files, export, backup and auto backup on the phone answer "not available on iPhone yet" for now — those are stages W1 and W4; the Agent API section is always off.
- Checked in the browser pane (Chromium) at 375×812: the Study screen opens, no console errors; a card created through the bridge persists after a reload, the transcription is filled in, Study offers an introduction. Not yet checked in Safari (WebKit) — that is W2.
- Fixed after W0 (01.11.2026): in the phone build choosing Dark in Settings → Appearance did not work — the dark colours depended only on the system theme, and in a browser the page cannot change it (on the Mac `nativeTheme` does that). Now the page decides the theme (D58). Checked at 430×932: all six combinations "system light/dark × System/Light/Dark", instant switching with the button in Settings and a system theme change with System selected.
- Settings on the phone (01.11.2026, D59): only Appearance, Study and Voices are shown. Hidden: Agent API and "Connect an agent" (they will not exist on iPhone), auto backup to a folder and "Show backups in Finder" (they will not exist on iPhone). The Appearance and Voices hints talk about iPhone, the path to voices is "Settings → Accessibility → Spoken Content → Voices". The phone build has no code for the hidden sections at all. Settings on the Mac is as before; the Appearance, Study and Voices sections now show right away, without waiting for the Agent API state.
- A "Create backup…" button on the phone (01.11.2026, ahead of plan W4 — at the user's request): the core in the Worker prepares the same full backup as on the Mac (the service method `phone.backupFile`), and the page hands the file to the Share menu (`src/mobile/files.ts`: "Save to Files", iCloud Drive, AirDrop); where there is no Share menu for files — a normal download. The bridge intercepts `transfer.backup` on the page: the Share menu and the file picker only work in the window and right after a tap. Checked at 430×932: the file "Recallo backup 2026-11-01.json", format recallo-backup, schema 8, five tables, the core accepts it as a backup (inspectBackup). The Share menu on a real iPhone has not been checked yet — that is W5. The reminder about an old backup stays in W4.
- Noticed for W4: the Worker weighs 6.2 MB because of the pronunciation dictionary and emoji data — they should load on demand; `navigator.storage.persisted()` is false for now — request persistent storage.

## iPhone fixes (02.11.2026)

Found by the user on a real iPhone (13 Pro Max and 14 Pro Max) after installing from the Home Screen.

- **Icon**: iOS and Safari cache Home Screen icons by URL, so the surf icon is served under new names (`apple-touch-icon-surf.png`, `icon-*-surf.png`), and also under the old names — a page saved for offline use may still point to them, and a missing icon makes iOS draw a placeholder letter.
- **Full screen**: a Home Screen app got a viewport shorter than the screen by the status bar height, leaving a strip under the tabs (13 and 14 Pro Max). The first attempts — a solid status bar (`apple-mobile-web-app-status-bar-style: default`, the header colour through two theme-color tags) and filling the measured gap with the tab bar colour — did not help: iOS keeps the status bar style an app was installed with, and WebKit does not draw below the short edge. The cause is WebKit bug 301108: the viewport is short only while the page is shorter than the screen. Now in the Home Screen app the page is `min(100lvh, 100% + the top inset)` tall — iOS then gives the full viewport, and with a solid status bar the page does not grow past the screen; the gap measuring is removed.
- **Top blur**: iOS 26+ blurs the top edge of a Home Screen app over the header. A solid element in the header colour is painted at the very top of the screen (the status bar height, at least 10 px; the page colour during a session) — a reported workaround, not an Apple API. Measuring the gap with a solid status bar had also pushed bottom sheets (the restore confirmation) below the screen edge; that measuring is gone.
- **Black screen after Update**: the offline worker saved the start page from the browser's HTTP cache — it could be a stale page pointing to program files of the previous build, which no longer existed. Now installing always fetches fresh files (`cache: 'reload'`), the start page is network-first with a 4 s timeout (the saved copy only offline), and a new version takes over by itself (D62). A phone stuck on a black screen picks up the fix on its next launch. Checked in the pane: an update cycle keeps the data, during a session the notice shows at the top.
- **Voices**: language codes match in any spelling (es_AR, es-ar, es-AR); the voice list is re-read when returning to the app and retried, since iOS can hand it over late. Settings → Voices lists every English and Spanish voice the device shares with Recallo. That list showed that iPhone shares only built-in voices with web apps (for Spanish: Mónica es-ES and Paulina es-MX): downloaded voices like Isabela or Diego never reach Recallo, whatever is chosen in iOS settings. So the Argentine variant plays with the Mexican voice and is labelled "Mexican voice" (D61, approved by the user); the phone's Voices section explains why instead of suggesting to install a voice.

Result (02.11.2026): 421 automated tests pass (both databases); published. The full-screen and top-blur fixes were checked only in the browser pane (the layout does not change there): the iOS behaviour can be confirmed only on the iPhone. Still to be confirmed by the user: no strip under the tabs and no blur at the top, no black screen after updates, restore works, the Mexican voice plays.

## Everything in the repository in English (02.11.2026)

Requested on 02.11.2026: the repository is public, so it is all in English — the interface (already was), docs (README, ROADMAP, PLAN, AGENTS, DEPLOY, UPGRADE, AGENT_PROMPT, the kit's START_HERE, the requirements), code comments and test names. Cyrillic stays only where the app must handle Russian text, each place marked with an English comment (D63).

## Backlog for future phases

- **A third language of choice** (postponed by the user on 24.10.2026) — one more language space, for example French, German or Italian. The user picks the language in settings; the space is created next to English and Spanish with its own sets, progress and stats. The data is already split by `space_id`, so storage does not need rework. For now the language list is hard-coded, and it is necessary to:
  - make the list of spaces data (a `spaces` table + a language choice in Settings), not the `'en' | 'es'` union in `shared/types.ts`, `domain/validation.ts`, `api/routes.ts`, `api/openapi.ts`, `mcp/tools.ts`, `App.tsx`;
  - for each language define: the TTS voice, the rules for hiding the expression (`shared/masking.ts`: word forms, articles, diacritics), the transcription (for languages without a dictionary — an empty field with manual input), duplicate search (function words at the start) and emoji hints;
  - the language switch in the top bar must fit three spaces and more.

  Requested on 24.10.2026.


## Decisions made along the way

| # | Decision | Date |
| --- | --- | --- |
| D14 | The interface is in English by default (buttons, labels, error messages, the space names English/Spanish). Card contents are written in any language | 23.10.2026 |
| D15 | A new card answered "Remembered" goes through the 10 min step and only then to long-term review (steps 1 min → 10 min, as in Anki) | 23.10.2026 |
| D16 | Simple word forms are hidden automatically (EN: -s/-es/-ed/-ing, doubled consonant, -e/-y; ES: -s/-es); irregular forms — through explicit example fragments | 23.10.2026 |
| D17 | The app's name is **Recallo**; the project folder `~/Documents/Recallo`, data in `~/Library/Application Support/Recallo/recallo.sqlite` | 23.10.2026 |
| D18 | Masking phrase expressions: any word of the phrase can be inflected, common irregular verbs, the placeholders someone/something/your/yourself, an optional to/be/article at the start, variants split by "/", optional parts in brackets. On the DuoCards dictionary (172 cards) 8 examples of ~200 were not hidden instead of 48 | 23.10.2026 |
| D19 | Test data: the DuoCards export is loaded by the script `npm run import:duocards`; running it again skips words that already exist. A full import in the interface stays in MVP-4 | 23.10.2026 |
| D20 | Spanish phrases: variants split by " / " are hidden each on its own, the punctuation ¡¿!? at the edges of the expression does not get in the way of search, accents are ignored (como = cómo). Dialogue lines in a hint ("- …") stay one example with line breaks | 23.10.2026 |
| D21 | **Introduction mode** for new cards: first the word (with speech) → flip → meaning and examples; "Got it" (right) / "Not yet" (left). Only after "Got it" does the card go to recall by definition — in the same session about a minute later. An introduction does not change FSRS (memory is graded only by recall), but it is written to the history (`review_log.mode = 'intro'`) with the same protection against resubmitting. "Not yet" repeats the introduction a minute later. Queue order: due reviews → the first recall after an introduction → introducing new ones. Resetting progress returns a card to introduction. All already loaded new cards go through an introduction | 23.10.2026 |
| D22 | **Transcription** (IPA) on every card: filled in automatically offline — English from the CMU dictionary (American pronunciation), Spanish by reading rules (rioplatense: ll/y → [ʃ], z/c → [s]); editable by hand; recomputed when the word changes, unless it was edited. Shown at the introduction and on the back, but not on the recall front (it would give the answer away). Spanish speech — es-AR. Older cards are filled in at launch | 23.10.2026 |
| D23 | **Study card readability**: an explicit task on top ("What’s the word?" / "New word"), labelled Meaning and Examples blocks, examples as quotes, the gap — a noticeable "?" chip, on the back the answer with its transcription is separated from the meaning, above the buttons — a question ("Did you remember it?") | 23.10.2026 |
| D24 | **The Stats tab** (for the current language): word stages New → Introduced → Learning → Familiar → Learned (Learned — an interval ≥ 21 days, not "forever"); answers today, the share of "Remembered" over 30 days, the day streak, due tomorrow; activity over 14 days (remembered / forgot / new words) with a tooltip and a table; the hardest words (forgotten ≥ 2 times) with a link to edit them (SRS-12). Colours checked with a validator in both themes | 23.10.2026 |
| D25 | **An MCP server** in MVP-3 in addition to the REST API (refines D4): agents add and edit words right from the conversation. It works on top of REST, with the same token and rules | 23.10.2026 |
| D26 | **AI content generation** — a separate phase MVP-6 (refines D13): a meaning in the chosen language (English / Russian / Spanish), examples with fragments to hide, example translations; all of it a draft that the user saves | 23.10.2026 |
| D27 | **An emoji association** on a card: picked automatically offline from the word and meaning (emojibase tags in EN/RU/ES, rare words weigh more than common ones, for phrases the meaning matters more, a confidence threshold — better no emoji than a random one); in the editor — options, search in three languages and "No emoji". The user's choice is not overwritten (`emoji_auto = 0`). The offline pick is a heuristic: on the DuoCards dictionary ~110 of 186 cards got an emoji, some associations are vague; more accurate — with AI in MVP-6 | 23.10.2026 |
| D28 | **Study card v2**: the word side of a new word is coloured (a gradient) and minimal: emoji, word, transcription, a speech icon, no explanatory text. The back — meaning and examples in a book font (ui-serif / New York), larger and with more spacing, a limited line width | 23.10.2026 |
| D29 | **Editing a card in a session**: a pencil ✎ on the word side at an introduction and on the back (not on the recall front — the editor would show the answer). After saving the card updates in place and the session continues; while the editor is open the session keys are off | 23.10.2026 |
| D30 | **Emoji for the DuoCards dictionary picked by hand** by meaning: 138 of 172 English cards (80%) and all 14 Spanish ones, marked as the user's choice (`emoji_auto = 0`); 34 abstract words (yet, implicit, supersede…) have no emoji — a far-fetched picture hurts more than it helps. The emoji is also shown in the card list | 23.10.2026 |
| D31 | **The emoji is the card's title picture** in Study: large, centred at the top, in a circle, the same on both sides in both modes (introduction and recall), so the flip shows it is the same card | 23.10.2026 |
| D32 | **The first set for MVP-2 — "Movie"**: 17 English words from a Quizlet set (PDF), meanings in the form "in Russian (English definition)", the data in `data/sets/movie.json`. The duplicate `overrated` is removed; on import — a second duplicate check. The import is done within MVP-2, not earlier | 23.10.2026 |
| D33 | **Undoing a grade**: only a card's last grade is undone, and only if its progress has not changed since; FSRS progress and the introduction state go back to what they were, the history record is marked `undone_at` (not deleted) and is not counted in the stats; the card is shown again. Undoing again changes nothing | 24.10.2026 |
| D34 | **Recallo.app**: the app is built with `npm run dist:mac` (electron-builder, a local ad-hoc signature without an Apple certificate) and installed into Applications with `npm run install:mac`; the data is the same (`~/Library/Application Support/Recallo`). The icon — `build/icon.png` | 24.10.2026 |
| D35 | **The REST API on the built-in `node:http`** instead of Fastify: fewer dependencies and simpler security control. Only `127.0.0.1`, a Host check (DNS rebinding), a Bearer token, no CORS, a body up to 1 MB. A switch in Settings, off by default; port 47821, changeable in Settings. A single create with an existing word — 409 DUPLICATE (or `allowDuplicates`), a batch — a result per card. The agent does not get progress and history (API-17), but gets the ranges of the hidden word in examples (API-18) | 24.10.2026 |
| D36 | **The MCP server inside Recallo.app**: started by the Recallo binary with `ELECTRON_RUN_AS_NODE=1` (agents need no Node); it takes the address and token from the file `agent-api.json` in the data folder (permissions 0600, exists only while the API runs) — Claude's configs have no secrets, and a port or token change is picked up by itself. Tools: list_sets, search_cards, get_card, add_cards, update_card, move_cards, create_set, update_set, delete_set, delete_card; the deleting ones are marked destructive and require asking the user; the agent is asked to give emoji by meaning | 24.10.2026 |
| D37 | **Stress in hyphenated compounds**: if a part has its own primary stress, the other one-syllable parts get secondary stress (ˌlaɪkˈmaɪndəd), otherwise the primary goes on the first part (ˈskaɪˌhaɪ); function words are unstressed. The automatic transcriptions of 11 such cards were recomputed (manual edits untouched) | 24.10.2026 |
| D38 | **Import and export**: the format is detected by content (JSON → Recallo; a front/back header → DuoCards; term/meaning → Recallo CSV; otherwise Quizlet "term⇥definition" lines), with a manual choice and a column swap. Duplicates (in the database and inside the file) are skipped by default; empty lines are ignored. Recallo CSV — one row per card, up to 3 examples, with a BOM for Excel; JSON — lossless. A full backup does not contain settings and the API token; restoring replaces all sets, cards, progress and history, and before that the current database is copied to `recallo.before-restore-*.sqlite` | 24.10.2026 |
| D39 | **Distribution without notarization**: a `.dmg` for Apple Silicon with a local ad-hoc signature (hardened runtime off). On another Mac the first launch must be allowed: right-click → "Open" or "System Settings → Privacy & Security → Open Anyway". Version 0.4.0 | 24.10.2026 |
| D40 | **Today's swell**: wave height = 0.3 + 3.7 × (0.5 × regularity + 0.3 × accuracy + 0.2 × mastery) m, rounded to 0.1. Regularity — days with study over 7 days, including today; accuracy — the share of "Remembered" among recall answers over 14 days (from 5 answers, 0 before that); mastery — the share of Familiar + Learned among started words. The hint shows the wave after studying today (if not yet studied) or tomorrow. Undone grades do not count | 24.10.2026 |
| D41 | **The "Surf" theme**: a calm coast (study screens) combined with a retro poster (Futura headings, coral buttons and accents). Charts: Remembered #0b8e84, Forgot #dd5f45, New words #7159d1 (dark theme — #1fa396 / #e0634a / #8670e3), stages — a turquoise sequential scale. "Forgot" is a separate red so it is not confused with the brand coral | 24.10.2026 |
| D42 | **Sorting cards into sets**: 166 of 172 English cards without a set were sorted into 9 themed sets (Feelings and stress, Mindset and growth, People and relationships, Work and money, Slang and vibes, Travel and everyday life, Decisions and risks, Formal verbs, Describing words), overrated was added to Movie, the 14 Spanish ones — to the Greetings set. 6 connectors stayed without a set (yet, ultimately, ostensibly, from the get-go, a telltale sign, be a far cry from something). Progress did not change; the database copy before the change — `recallo.before-mvp4-sorting.sqlite` | 24.10.2026 |
| D43 | **Timed sessions**: the length off/5/10/15 min is stored in localStorage; the countdown follows the system clock (`shared/sessionTimer.ts`). Time does not interrupt a card — the summary shows after its grade. An extension counts from the moment of the tap: time spent on the summary screen is neither lost nor added. The timer does not pause while the editor is open | 24.10.2026 |
| D44 | **Two Spanish pronunciation variants**: the `transcription` field — the space's primary variant (es-AR), `transcription_alt` — the second (es-ES), migration 7. The variants are described in `shared/accents.ts`; English has no second variant (UK can be added the same way). The voice is chosen by region with fallback regions; without an es-AR voice the Latin American es-MX plays, and Settings → Voices explains how to install an Argentine one | 24.10.2026 |
| D45 | **The voice answer is cancelled**: MVP-5 (recording an answer, recognition, pronunciation scoring, VOICE-01…19) is not done. Before the decision the options were checked: Azure Speech (scoring by sounds, needs a key and a paid service beyond the free tier, audio goes to Microsoft) and macOS recognition (on this Mac English works offline, Spanish only through Apple's servers, no pronunciation scoring). Acceptance criteria 6 and 8 of section 13 are dropped; criterion 9 (studying without a microphone) stays | 24.10.2026 |
| D46 | **No AI in the editor**: MVP-6 is cancelled, AI help comes through an MCP agent. In the descriptions of `add_cards` and the MCP examples: 1–3 natural examples, example translations in the meaning's language (a Russian meaning → a Russian translation). Adding examples in bulk to cards without them — also through the agent (`search_cards` + `update_card`) | 24.10.2026 |
| D47 | **Speech: text and buttons**: the synthesizer gets cleaned-up text (`shared/speech.ts`), the card shows the original. If a space has several pronunciation variants, the 🔊 button is only on variants with a voice of their own region — a foreign voice sounds the same for all of them and is misleading; if there are none, the primary variant plays with the nearest voice. (On iPhone refined by D61.) | 24.10.2026 |
| D48 | **The new-word limit**: the setting `study.newPerDay.<language>` in the settings table (10 by default, 0–500), a one-off increase `study.extraNew.<language>` = {date, +N} works only on that day. "Started today" = introductions with `introduced_at` from the start of the local day + postponed "Not yet" (`introduced_at` empty, `intro_due` set). The limit only restricts giving out not-yet-started new cards; the New counter = postponed + min(not started, remaining). Undoing an introduction returns the word to the limit automatically (computed from the data, not a separate counter) | 24.10.2026 |
| D49 | **Theme choice**: the setting `appearance.theme` = system / light / dark in the settings table; the main process sets `nativeTheme.themeSource` at launch and on change. Styles still rely on `prefers-color-scheme`, so no separate CSS rules for a manual theme are needed, and system dialogs (open/save a file) get the same theme. (Refined by D58.) | 24.10.2026 |
| D50 | **Typed answer mode**: the comparison in `shared/answerCheck.ts` — ignoring case, diacritics, punctuation, extra spaces and a leading to/a/an/the (for English); sth/sb/someone = something/somebody; acceptable variants — the whole phrase, parts split by " / ", a slash inside a phrase, optional brackets, list items "…, etc.". One edit (Levenshtein) in an answer of 5+ letters — almost (counts). The check is a separate call `study.check`, which reveals the answer; the user picks the final grade in `study.grade`, and that goes to FSRS. `source` in the history stays 'manual' (a table constraint), the typed mode is visible by `typed_answer` | 27.10.2026 |
| D51 | **Auto backup**: `main/autoBackup.ts`, the folder `<userData>/backups`, the format — the same JSON as Settings → Backup. A backup for the local date is made if there is none yet; rotation: the 7 most recent dates + the most recent backup of each of the 4 previous weeks (from Monday) not among those 7. The settings `backup.auto` (on by default), `backup.lastAt`, `backup.lastError` in the settings table. Parallel runs do not duplicate the work | 27.10.2026 |
| D52 | **The kit for another Mac**: DMGs for both architectures are built on Apple Silicon by cross-building (`electron-builder --mac dmg --arm64 --x64`, the better-sqlite3 module is taken prebuilt for each architecture); after the build `install-app-deps` brings the module back for the current Mac so tests work. The app is signed ad-hoc and not notarized — on another Mac the first launch is through "Open" or removing the quarantine. Building from source on the target Mac (`setup-mac.sh`) does not need Gatekeeper permission | 29.10.2026 |
| D53 | **An introduction without self-grading**: an introduction has nothing to recall, so the showing is created already revealed and `study.next` returns the full back (`back: CardBack`) instead of the former front `IntroFront`; the interface sends only "remembered". The flip animation is in the interface: its first half runs in parallel with the request for the back, so the answer is delayed by no more than 180 ms | 29.10.2026 |
| D54 | **Card search**: `domain/cardSearch.ts`, in memory over all cards of the scope (SQLite cannot compare ignoring case for Cyrillic and diacritics). Field weight (word 0, meaning 10, examples and set 20) + match level (whole word 0, beginning 1, part 2, typo 3), summed over the query words; a match of the query with the whole card word comes first. A typo — Levenshtein distance ≤ 1 to the word or its beginning of the same length, only for query words of 5+ letters; part of a word — only from 3 letters | 30.10.2026 |
| D55 | **The new-word limit mid-session**: if `next` returned `wait` and the limit is reached (`newToday.remaining = 0`, `newWaiting > 0`), Study shows a choice instead of waiting. "Practice current words" turns on a session flag in the interface, and from then on every `next` goes with `allowEarly`; early review picks, of the two nearest, a card different from `avoidCardId`. "Learn 5 new words" — the former `study.learnMore`. Learned words (Review) ahead of time do not trigger this choice | 01.11.2026 |
| D56 | **New words not in a row**: the `afterNew` option in `study.next`. If the next card would be a new one (an introduction or "Not yet") and there are no due reviews, the nearest by due date card in Learning/Relearning or an already introduced new one (ahead of time) is taken; in a set scope — also Review of that set. A 1:1 ratio; if there is nothing to mix with, the new word is shown. The interface sets the flag; without it the order is as before — for agents and tests | 01.11.2026 |
| D57 | **Recallo: Mobile — a web app, not Swift**: on iPhone — the same core and interface in the browser, installed with "Add to Home Screen", hosted on GitHub Pages. Reasons: with a free Apple ID an app from Xcode has to be reinstalled every 7 days and cannot be given to friends; the study rules stay one code for the Mac and iPhone. The phone's data is separate; moving from the Mac — by restoring a full backup | 01.11.2026 |
| D58 | **The theme by a page attribute**: the dark colours in styles.css are under `:root[data-theme='dark']`, not `@media (prefers-color-scheme: dark)`. The attribute is set by `renderer/src/lib/theme.ts`: Light/Dark — as chosen, System — by the system, following its changes. Before the core answers, the theme comes from a copy of the choice in localStorage, then is checked against the setting in the database. On the Mac `nativeTheme` still changes the window's system theme (scroll bars, system elements); the behaviour did not change | 01.11.2026 |
| D59 | **The interface build — a build-time flag**: `__RECALLO_PLATFORM__` = 'mac' (electron.vite.config.ts) or 'phone' (vite.mobile.config.ts), read through `renderer/src/lib/platform.ts` (`IS_PHONE`). Not browser detection: the decision is made at build time, and code the phone does not need drops out of the build. The phone does not show features it does not have (Agent API, auto backup, Finder) and ones not done yet (backup and restore before W1/W4) | 01.11.2026 |
| D60 | **Offline without third-party packages**: an own service worker written by a build plugin (`offlineWorker` in vite.mobile.config.ts) — a cache of all files by the content hash, lookups with ignoreSearch and ignoreVary, an update only on tapping "Update" (changed by D62). The pronunciation dictionary and emoji stay in the core: 1.3 MB compressed downloads once; splitting them out would mean making transcription in the domain asynchronous for the sake of one download | 01.11.2026 |
| D61 | **A stand-in voice from a nearby region**: a pronunciation variant without a voice of its own region plays with a voice from a nearby region and is labelled with that region ("Mexican voice") next to its 🔊 on cards and in Settings → Voices; a voice that would sound like the other variant (Spain for Argentina) is never used. Reason: iPhone shares only its built-in voices with web apps (for Spanish — Mónica es-ES and Paulina es-MX), so downloaded voices like Isabela or Diego never reach Recallo there. Language codes match in any spelling (es_AR, es-ar). Approved by the user | 02.11.2026 |
| D62 | **Updates take over by themselves**: the offline worker installs with fresh files (`cache: 'reload'`, past the browser's HTTP cache), the start page is network-first with a 4 s timeout (the saved copy only offline), and a new version takes over at once (`skipWaiting`). The page reloads to it, or during a Study session shows "New version ready · Reload" at the top. Reason: a stale start page from the HTTP cache pointed to deleted files and the app opened to a black screen | 02.11.2026 |
| D63 | **Everything in the repository in English**: the interface, docs, code comments and test names. Cyrillic stays only where the app must handle Russian text (the user's meanings are Russian): test data for Russian search, emoji and import, the Russian stop words, and the user's word sets in `data/sets/`; each such place has an English comment. Reason: the repository is public | 02.11.2026 |
