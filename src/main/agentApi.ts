import { chmodSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentApiState } from '../shared/types'
import type { LocalApiServer } from './api/http'
import type { SettingsService } from './domain/settings'

/** Как запускать MCP-сервер: бинарник Recallo в режиме Node и путь к скрипту сервера. */
export interface McpLaunch {
  command: string
  script: string
}

/** Имя служебного файла подключения: из него MCP-сервер берёт адрес API и токен. */
export const CONNECTION_FILE = 'agent-api.json'

/**
 * Управляет API для агентов: запускает и останавливает сервер по настройкам, пишет файл
 * подключения (права только для владельца) и готовит фрагменты конфигурации для Claude.
 */
export class AgentApiController {
  private status: AgentApiState['status'] = 'stopped'
  private error: string | null = null
  private url: string | null = null

  constructor(
    private readonly settings: SettingsService,
    private readonly server: LocalApiServer,
    private readonly connectionFile: string,
    private readonly mcp: McpLaunch
  ) {}

  /** Приводит сервер в соответствие с настройками (при запуске приложения и после изменений). */
  async sync(): Promise<AgentApiState> {
    const { enabled, port, token } = this.settings.agentApi()
    await this.server.stop()
    this.removeConnectionFile()
    this.url = null
    this.error = null
    this.status = 'stopped'
    if (!enabled) return this.state()

    try {
      const actualPort = await this.server.start(port)
      this.url = `http://127.0.0.1:${actualPort}`
      this.status = 'running'
      writeFileSync(this.connectionFile, JSON.stringify({ url: this.url, token }, null, 2), { mode: 0o600 })
      chmodSync(this.connectionFile, 0o600)
    } catch (error) {
      this.status = 'error'
      const code = (error as NodeJS.ErrnoException).code
      this.error =
        code === 'EADDRINUSE'
          ? `Port ${port} is already used by another program. Choose another port.`
          : `Could not start the API: ${(error as Error).message}`
    }
    return this.state()
  }

  async update(input: unknown): Promise<AgentApiState> {
    this.settings.updateAgentApi(input)
    return this.sync()
  }

  async regenerateToken(): Promise<AgentApiState> {
    this.settings.regenerateToken()
    return this.sync()
  }

  /** При выходе: файл подключения удаляется сразу (синхронно), сервер останавливается следом. */
  async shutdown(): Promise<void> {
    this.removeConnectionFile()
    await this.server.stop()
  }

  state(): AgentApiState {
    const { enabled, port, token } = this.settings.agentApi()
    const quote = (value: string) => `"${value.replace(/(["\\$`])/g, '\\$1')}"`
    return {
      enabled,
      port,
      token,
      status: this.status,
      error: this.error,
      url: this.url,
      connection: {
        claudeCode: `claude mcp add --scope user recallo -e ELECTRON_RUN_AS_NODE=1 -- ${quote(this.mcp.command)} ${quote(this.mcp.script)}`,
        claudeDesktop: JSON.stringify(
          { mcpServers: { recallo: { command: this.mcp.command, args: [this.mcp.script], env: { ELECTRON_RUN_AS_NODE: '1' } } } },
          null,
          2
        ),
        claudeDesktopConfigPath: join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json')
      }
    }
  }

  private removeConnectionFile(): void {
    rmSync(this.connectionFile, { force: true })
  }
}
