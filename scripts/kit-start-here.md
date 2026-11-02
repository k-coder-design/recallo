# Recallo {{VERSION}} — start here

Recallo is a macOS app (13 Ventura or newer) for remembering English and Spanish words.

## Recallo is not installed yet

1. Find your Mac type: Apple menu  → About This Mac. Apple M1/M2/M3/M4… — open `Recallo-{{VERSION}}-arm64.dmg`, Intel — `Recallo-{{VERSION}}-x64.dmg`.
2. Drag Recallo into Applications.
3. First launch: right-click Recallo in Applications → Open → Open (the app is not notarized by Apple, so macOS asks once).

The full guide, with all commands and connecting Claude, is [DEPLOY.md](DEPLOY.md).

## Recallo is already installed — upgrade

Close Recallo (⌘Q), open Terminal in this folder and run:

```bash
bash upgrade-mac.sh
```

The script saves a copy of your words, replaces the app and checks the version. What's new and how to roll back — [UPGRADE.md](UPGRADE.md).

## Through an AI agent

Open this folder in Claude Code (or another agent) and paste the right prompt from [AGENT_PROMPT.md](AGENT_PROMPT.md): "New install" or "Upgrade".

## What's in the folder

| File | Purpose |
| --- | --- |
| `Recallo-{{VERSION}}-arm64.dmg` | The app for Macs with Apple Silicon (M1 and newer) |
| `Recallo-{{VERSION}}-x64.dmg` | The app for Intel Macs |
| `upgrade-mac.sh` | Upgrade an installed Recallo with a database copy |
| `Recallo-{{VERSION}}-source.zip` | Source code — build the app on site (needs Node.js 22+) |
| `DEPLOY.md` | New install, moving words from another Mac, connecting Claude, voices |
| `UPGRADE.md` | Upgrading from older versions: what changed, steps, checks, rollback |
| `AGENT_PROMPT.md` | Ready prompts for an AI agent |
| `SHA256SUMS.txt` | Checksums: `shasum -a 256 -c SHA256SUMS.txt` |

Words and progress are not in the kit: everyone has their own. Moving your words to another Mac — DEPLOY.md, "Moving words and progress".
