import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Db } from '../db/database'

export const DEFAULT_API_PORT = 47821

/** Appearance theme (D49): system — follows macOS. */
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
const themeSchema = z.enum(THEMES, { error: 'Choose System, Light or Dark' })

export interface AutoBackupSettings {
  enabled: boolean
  /** Time of the last successful automatic backup (ISO); null — none yet. */
  lastAt: string | null
  /** Error of the last attempt; null — the last attempt succeeded. */
  lastError: string | null
}

export interface AgentApiSettings {
  enabled: boolean
  port: number
  token: string
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  port: z
    .number({ error: 'Port must be a number' })
    .int('Port must be a whole number')
    .min(1024, 'Use a port from 1024 to 65535')
    .max(65535, 'Use a port from 1024 to 65535')
    .optional()
})

/** App settings in the settings table (key — value). */
export class SettingsService {
  constructor(private readonly db: Db) {}

  private read(key: string): string | undefined {
    return this.db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) as string | undefined
  }

  private write(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, value)
  }

  /** Agent API settings; the token is created on first access. The API is off by default. */
  agentApi(): AgentApiSettings {
    let token = this.read('agentApi.token')
    if (!token) {
      token = newToken()
      this.write('agentApi.token', token)
    }
    return {
      enabled: this.read('agentApi.enabled') === '1',
      port: Number(this.read('agentApi.port') ?? DEFAULT_API_PORT),
      token
    }
  }

  updateAgentApi(input: unknown): AgentApiSettings {
    const data = updateSchema.parse(input)
    if (data.enabled !== undefined) this.write('agentApi.enabled', data.enabled ? '1' : '0')
    if (data.port !== undefined) this.write('agentApi.port', String(data.port))
    return this.agentApi()
  }

  theme(): Theme {
    const stored = this.read('appearance.theme')
    return (THEMES as readonly string[]).includes(stored ?? '') ? (stored as Theme) : 'system'
  }

  setTheme(value: unknown): Theme {
    const theme = themeSchema.parse(value)
    this.write('appearance.theme', theme)
    return theme
  }

  /** Automatic backup (MVP-9, D51): on by default; time and error of the last attempt. */
  autoBackup(): AutoBackupSettings {
    return {
      enabled: this.read('backup.auto') !== '0',
      lastAt: this.read('backup.lastAt') ?? null,
      lastError: this.read('backup.lastError') || null
    }
  }

  setAutoBackupEnabled(value: unknown): AutoBackupSettings {
    this.write('backup.auto', z.boolean({ error: 'Choose on or off' }).parse(value) ? '1' : '0')
    return this.autoBackup()
  }

  recordAutoBackup(result: { at: string } | { error: string }): void {
    if ('at' in result) {
      this.write('backup.lastAt', result.at)
      this.write('backup.lastError', '')
    } else this.write('backup.lastError', result.error)
  }

  /** A new token: the old one stops working right away. */
  regenerateToken(): AgentApiSettings {
    this.write('agentApi.token', newToken())
    return this.agentApi()
  }
}

function newToken(): string {
  return `rcl_${randomBytes(32).toString('base64url')}`
}
