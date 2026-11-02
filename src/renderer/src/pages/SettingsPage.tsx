import { useEffect, useState } from 'react'
import type { AgentApiState, AutoBackupState, BackupSummary, NewWordsToday, OpenedFile, SpaceId, Theme } from '../../../shared/types'
import { ALT_ACCENTS, PRIMARY_ACCENTS, type Accent } from '../../../shared/accents'
import { Modal } from '../components/Modal'
import { SpeakButton } from '../components/SpeakButton'
import { canSpeak, chooseVoice, normalizeLang, playableLangs, useVoices } from '../lib/tts'
import { call, errorMessage } from '../lib/api'
import { backupAge, markBackedUp } from '../lib/backupReminder'
import { IS_PHONE } from '../lib/platform'
import { applyTheme } from '../lib/theme'

/** Copy to the clipboard: the Clipboard API, or a hidden field if it is unavailable. */
async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const area = document.createElement('textarea')
    area.value = value
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="button"
      onClick={() =>
        void copyText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }
    >
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

export function SettingsPage() {
  // On iPhone — only what works there (D59): no Agent API or MCP, no automatic backup to a folder or Finder.
  return (
    <section className="page settings">
      <h1>Settings</h1>

      <AppearancePanel />

      <StudyPanel />

      {!IS_PHONE && <AgentApiPanels />}

      <VoicesPanel />

      <BackupPanel />
    </section>
  )
}

/** Agent API and connecting an agent (MVP-3) — Mac only. */
function AgentApiPanels() {
  const [state, setState] = useState<AgentApiState | null>(null)
  const [port, setPort] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = async (action: () => Promise<AgentApiState>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      setState(next)
      setPort(String(next.port))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void apply(() => call('settings.agentApi'))
  }, [])

  if (!state) return error ? <p className="error">{error}</p> : null

  const portChanged = port.trim() !== String(state.port)
  const statusText =
    state.status === 'running'
      ? `Running at ${state.url}`
      : state.status === 'error'
        ? (state.error ?? 'Could not start')
        : 'Off'

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Agent API</h2>
            <p className="muted small">
              Let AI agents such as Claude read and edit your sets and cards. Works only while Recallo is open, only on this
              computer, and only with your token. Learning progress is never shared.
            </p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={state.enabled}
              disabled={busy}
              onChange={(e) => void apply(() => call('settings.updateAgentApi', { enabled: e.target.checked }))}
              aria-label="Enable Agent API"
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>

        <p className={`api-status status-${state.status}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {statusText}
        </p>
        {error && <p className="error">{error}</p>}

        <div className="settings-grid">
          <label className="field">
            <span>Port</span>
            <div className="inline-field">
              <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className="port-input" />
              <button
                type="button"
                className="button"
                disabled={!portChanged || busy}
                onClick={() => void apply(() => call('settings.updateAgentApi', { port: Number(port) }))}
              >
                Save
              </button>
            </div>
          </label>

          <div className="field">
            <span>Token</span>
            <div className="inline-field">
              <code className="token">{showToken ? state.token : `${state.token.slice(0, 8)}${'•'.repeat(24)}`}</code>
              <button type="button" className="button" onClick={() => setShowToken((v) => !v)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
              <CopyButton value={state.token} />
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Create a new token? The old one stops working right away. Claude via MCP picks up the new one automatically.')) {
                    void apply(() => call('settings.regenerateToken'))
                  }
                }}
              >
                New token
              </button>
            </div>
            <small className="muted">Only needed for direct HTTP access. Agents connected via MCP read it automatically.</small>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Connect an agent</h2>
        <p className="muted small">
          Recallo comes with an MCP server: the agent can search, add and edit cards right from the conversation. Turn on
          Agent API above first.
        </p>

        <div className="connect-block">
          <h3>Claude Code</h3>
          <p className="muted small">Run this once in Terminal:</p>
          <div className="code-row">
            <code className="code-block">{state.connection.claudeCode}</code>
            <CopyButton value={state.connection.claudeCode} />
          </div>
        </div>

        <div className="connect-block">
          <h3>Claude Desktop</h3>
          <p className="muted small">
            Add this to <code>{state.connection.claudeDesktopConfigPath}</code> (merge with existing “mcpServers” if there are
            any), then restart Claude Desktop:
          </p>
          <div className="code-row">
            <pre className="code-block">{state.connection.claudeDesktop}</pre>
            <CopyButton value={state.connection.claudeDesktop} />
          </div>
        </div>

        {state.url && (
          <div className="connect-block">
            <h3>Other tools</h3>
            <p className="muted small">REST API description (OpenAPI):</p>
            <div className="code-row">
              <code className="code-block">{`${state.url}/api/v1/openapi.json`}</code>
              <CopyButton value={`${state.url}/api/v1/openapi.json`} />
            </div>
          </div>
        )}
      </section>
    </>
  )
}

/** A full backup with progress and history, and restoring from it (MVP-4). */
function BackupPanel() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ file: OpenedFile; summary: BackupSummary } | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const createBackup = () =>
    run(async () => {
      const result = await call('transfer.backup')
      // On the phone the path is unknown: the file went to the Share sheet (Files, iCloud Drive, AirDrop).
      if (result.saved) {
        markBackedUp()
        setMessage(result.path ? `Backup saved to ${result.path}` : 'Backup created.')
      }
    })

  const pickBackup = () =>
    run(async () => {
      const file = await call('transfer.openFile', 'backup')
      if (file) setPending({ file, summary: await call('transfer.inspectBackup', file.content) })
    })

  const restore = () =>
    run(async () => {
      if (!pending) return
      await call('transfer.restore', pending.file.content)
      setPending(null)
      // The data was replaced entirely — reload the interface so everything is read again.
      window.location.reload()
    })

  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="muted small">
        A full copy of all sets, cards, learning progress and history in one file.{' '}
        {IS_PHONE
          ? 'Keep it in Files or iCloud Drive: deleting Recallo from the Home Screen deletes its data.'
          : 'Use it before big changes or to move Recallo to another Mac. To share words without progress, use Export in Cards.'}
      </p>
      {!IS_PHONE && <AutoBackupSection />}
      {IS_PHONE && <p className="small muted">{backupAge() ? `Last backup: ${backupAge()}.` : 'No backup yet.'}</p>}
      <div className="row backup-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void createBackup()}>
          Create backup…
        </button>
        <button type="button" className="button" disabled={busy} onClick={() => void pickBackup()}>
          Restore from backup…
        </button>
      </div>
      {message && <p className="small">{message}</p>}
      {error && <p className="error">{error}</p>}

      {pending && (
        <Modal
          title="Replace all data with this backup?"
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="button" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button danger" onClick={() => void restore()} disabled={busy}>
                Replace and restore
              </button>
            </>
          }
        >
          <p>
            “{pending.file.name}” from {new Date(pending.summary.exportedAt).toLocaleString()} has {pending.summary.cards} cards,{' '}
            {pending.summary.sets} sets and {pending.summary.reviews} answers. All your current cards, sets and progress will be replaced.
          </p>
          <p className="muted small">
            {IS_PHONE
              ? 'To keep your current data, cancel and create a backup first.'
              : 'Your current data is saved automatically before restoring, so this step can be undone.'}
          </p>
        </Modal>
      )}
    </section>
  )
}

/** A sample to listen to: a word where the pronunciations sound different. */
const SAMPLES: Record<string, string> = { 'en-US': 'water', 'es-AR': 'Me llamo Lucía', 'es-ES': 'Me llamo Lucía' }

/** Which system voices speak each pronunciation and how to add a missing one (D44). */
function VoicesPanel() {
  const voices = useVoices()
  const accents: Accent[] = [PRIMARY_ACCENTS.en, PRIMARY_ACCENTS.es, ...(ALT_ACCENTS.es ? [ALT_ACCENTS.es] : [])]
  const spanish = [PRIMARY_ACCENTS.es, ...(ALT_ACCENTS.es ? [ALT_ACCENTS.es] : [])].map((a) => a.lang)
  const playable = new Set([PRIMARY_ACCENTS.en.lang, ...playableLangs(spanish, voices)])
  return (
    <section className="panel">
      <h2>Voices</h2>
      <p className="muted small">
        Recallo uses the voices installed {IS_PHONE ? 'on your iPhone' : 'in macOS'}. Each pronunciation on a card plays with its own
        voice.
      </p>
      {!canSpeak() ? (
        <p className="muted">Speech is unavailable on this {IS_PHONE ? 'iPhone' : 'computer'}.</p>
      ) : (
        <ul className="voice-list">
          {accents.map((accent) => {
            const { voice, exact } = chooseVoice(accent.lang, voices)
            return (
              <li key={accent.lang} className="voice-row">
                <span>{`${accent.flag}\u00a0${accent.label}`}</span>
                <span>
                  {!playable.has(accent.lang) ? (
                    <span className="muted">Not played</span>
                  ) : voice ? (
                    <>
                      <span className="voice-name">{voice.name}</span> <span className="muted small">{voice.lang}</span>
                    </>
                  ) : (
                    <span className="muted">No voice</span>
                  )}
                </span>
                {playable.has(accent.lang) ? <SpeakButton text={SAMPLES[accent.lang] ?? accent.label} lang={accent.lang} /> : <span />}
                {!exact && (
                  <p className="voice-missing">
                    No voice for {accent.label} ({accent.lang}) is installed
                    {playable.has(accent.lang)
                      ? voice
                        ? `, so ${voice.name} (${voice.lang}) plays instead.`
                        : '.'
                      : ', so cards play only the other pronunciation.'}{' '}
                    To add one, open{' '}
                    {IS_PHONE
                      ? 'Settings → Accessibility → Spoken Content → Voices'
                      : 'System Settings → Accessibility → Spoken Content → System voice → Manage Voices…'}
                    , pick {accent.lang.startsWith('en') ? 'English' : 'Spanish'} → {accent.label}
                    {accent.lang === 'es-AR' ? ' (for example, Diego)' : ''}, then restart Recallo.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canSpeak() && <DeviceVoices voices={voices} />}
    </section>
  )
}

/**
 * Every English and Spanish voice the device gives Recallo, with its language code — to check on the iPhone
 * that a newly installed voice (e.g. Argentine) is really visible to the app, and under which code.
 */
function DeviceVoices({ voices }: { voices: SpeechSynthesisVoice[] }) {
  // A plain button and a one-column list: <details> with CSS columns misrendered in iOS Safari.
  const [open, setOpen] = useState(false)
  const relevant = voices
    .filter((v) => /^(en|es)/.test(normalizeLang(v.lang ?? '')))
    .sort((a, b) => normalizeLang(a.lang).localeCompare(normalizeLang(b.lang)) || a.name.localeCompare(b.name))
  return (
    <div className="device-voices">
      <button type="button" className="link-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? '▾' : '▸'} All English and Spanish voices on this {IS_PHONE ? 'iPhone' : 'Mac'} ({relevant.length})
      </button>
      {!open ? null : relevant.length === 0 ? (
        <p className="muted small">The system has not shared any voices with Recallo yet. Reopen the app and check again.</p>
      ) : (
        <ul className="device-voice-list">
          {relevant.map((v, i) => (
            <li key={`${v.voiceURI}-${i}`}>
              <span>{v.name}</span> <span className="muted small">{v.lang}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const STUDY_SPACES: Array<{ id: SpaceId; name: string }> = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Spanish' }
]

/** Daily new-word limit for each language (MVP-7, D48). */
function StudyPanel() {
  return (
    <section className="panel">
      <h2>Study</h2>
      <p className="muted small">
        How many new words to meet per day. Reviews are never limited. Use 0 to only review what you already know.
      </p>
      <div className="limit-list">
        {STUDY_SPACES.map((space) => (
          <NewPerDayField key={space.id} spaceId={space.id} name={space.name} />
        ))}
      </div>
    </section>
  )
}

function NewPerDayField({ spaceId, name }: { spaceId: SpaceId; name: string }) {
  const [today, setToday] = useState<NewWordsToday | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    call('study.newWordsToday', spaceId)
      .then((data) => {
        setToday(data)
        setValue(String(data.limit))
      })
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [spaceId])

  const save = async () => {
    setError(null)
    try {
      const data = await call('study.setNewPerDay', spaceId, Number(value))
      setToday(data)
      setValue(String(data.limit))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const changed = today !== null && value.trim() !== String(today.limit)
  return (
    <div className="field limit-row">
      <span>{name} — new words per day</span>
      <div className="inline-field">
        <input
          className="port-input"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && changed) void save()
          }}
          aria-label={`${name} new words per day`}
        />
        <button type="button" className="button" disabled={!changed} onClick={() => void save()}>
          {saved ? 'Saved ✓' : 'Save'}
        </button>
        {today && (
          <span className="muted small">
            Today: {today.started} of {today.limit + today.extra} met
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

const THEME_OPTIONS: Array<{ id: Theme; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
]

/** Appearance theme: follows macOS, always light or always dark (D49). */
function AppearancePanel() {
  const [theme, setTheme] = useState<Theme | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    call('settings.theme')
      .then(setTheme)
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [])

  const choose = async (next: Theme) => {
    setError(null)
    try {
      const saved = await call('settings.setTheme', next)
      applyTheme(saved)
      setTheme(saved)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Appearance</h2>
          <p className="muted small">System follows the light or dark mode of {IS_PHONE ? 'your iPhone' : 'macOS'}.</p>
        </div>
        <div className="length-options" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={theme === option.id}
              className={theme === option.id ? 'active' : ''}
              onClick={() => void choose(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Daily automatic backup: the switch, when the last one was made and where backups are kept (MVP-9, D51). */
function AutoBackupSection() {
  const [state, setState] = useState<AutoBackupState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    call('backup.autoState')
      .then(setState)
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [])

  const toggle = async (enabled: boolean) => {
    setError(null)
    try {
      setState(await call('backup.setAuto', enabled))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (!state) return error ? <p className="error">{error}</p> : null
  return (
    <div className="auto-backup">
      <div className="panel-head">
        <div>
          <h3>Back up automatically every day</h3>
          <p className="muted small">
            Keeps the last 7 days and one backup for each of the 4 weeks before. Restore any of them with “Restore from backup…”.
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => void toggle(e.target.checked)}
            aria-label="Back up automatically every day"
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>
      <div className="row auto-backup-status">
        <span className={`small ${state.lastError ? 'error' : 'muted'}`} role="status">
          {state.lastError
            ? `Last automatic backup failed: ${state.lastError}${state.lastAt ? `. Last successful: ${formatWhen(state.lastAt)}` : ''}`
            : state.lastAt
              ? `Last backup: ${formatWhen(state.lastAt)} · ${state.count} ${state.count === 1 ? 'backup' : 'backups'} kept`
              : state.enabled
                ? 'The first backup will be made shortly.'
                : 'Automatic backups are off.'}
        </span>
        <button type="button" className="link-button" onClick={() => void call('backup.showFolder')}>
          Show backups in Finder
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
