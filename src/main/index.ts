import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { openDatabase, type NativeDb } from './db/database'
import { registerIpc } from './ipc'
import { createHandlers, createServices } from './services'
import { AgentApiController, CONNECTION_FILE } from './agentApi'
import { LocalApiServer } from './api/http'
import { createRoutes } from './api/routes'
import { SettingsService } from './domain/settings'
import { FileTransfer } from './fileTransfer'
import { AutoBackup } from './autoBackup'

// Отдельная папка данных для разработки и проверок, чтобы не трогать рабочую базу.
const userDataOverride = process.env['RECALLO_USER_DATA']
if (userDataOverride) app.setPath('userData', userDataOverride)

let db: NativeDb | null = null
let agentApi: AgentApiController | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'Recallo',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // Внешние ссылки открываются в браузере, навигация внутри окна запрещена.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  db = openDatabase(join(app.getPath('userData'), 'recallo.sqlite'))
  const services = createServices(db)
  services.cards.fillMissingTranscriptions()
  services.cards.fillMissingEmojis()

  // API для агентов (MVP-3): работает, только если включён в Settings; MCP-сервер запускается
  // тем же бинарником Recallo в режиме Node и берёт адрес и токен из файла подключения.
  const settings = new SettingsService(db)
  // Тема применяется ко всему приложению: prefers-color-scheme в интерфейсе и системные диалоги (D49).
  nativeTheme.themeSource = settings.theme()
  const server = new LocalApiServer(createRoutes(services, { version: app.getVersion() }), db, () => settings.agentApi().token)
  agentApi = new AgentApiController(settings, server, join(app.getPath('userData'), CONNECTION_FILE), {
    command: process.execPath,
    script: join(app.getAppPath(), 'out/mcp/index.cjs')
  })
  // Ежедневная автокопия (MVP-9, D51): при запуске и раз в час — так копия появится и после полуночи.
  const autoBackup = new AutoBackup(services.transfer, settings, join(app.getPath('userData'), 'backups'), () => new Date())
  registerIpc(
    createHandlers(
      services,
      agentApi,
      new FileTransfer(services.transfer, db, app.getPath('userData')),
      {
        theme: () => settings.theme(),
        setTheme: (value) => {
          const theme = settings.setTheme(value)
          nativeTheme.themeSource = theme
          return theme
        }
      },
      {
        state: () => autoBackup.state(),
        setEnabled: (enabled) => autoBackup.setEnabled(enabled),
        showFolder: () => void mkdir(autoBackup.folder, { recursive: true }).then(() => shell.openPath(autoBackup.folder))
      }
    )
  )
  await agentApi.sync()
  createWindow()
  void autoBackup.runIfDue()
  setInterval(() => void autoBackup.runIfDue(), 60 * 60 * 1000).unref()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  // Сервер и файл подключения убираем вместе с приложением: агенты получат понятную ошибку.
  void agentApi?.shutdown()
  db?.close()
  db = null
})
