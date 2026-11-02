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

// A separate data folder for development and checks, so the real database is not touched.
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

  // External links open in the browser; navigation inside the window is blocked.
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

  // Agent API (MVP-3): runs only if enabled in Settings; the MCP server is started
  // by the same Recallo binary in Node mode and reads the address and token from the connection file.
  const settings = new SettingsService(db)
  // The theme applies to the whole app: prefers-color-scheme in the interface and system dialogs (D49).
  nativeTheme.themeSource = settings.theme()
  const server = new LocalApiServer(createRoutes(services, { version: app.getVersion() }), db, () => settings.agentApi().token)
  agentApi = new AgentApiController(settings, server, join(app.getPath('userData'), CONNECTION_FILE), {
    command: process.execPath,
    script: join(app.getAppPath(), 'out/mcp/index.cjs')
  })
  // Daily automatic backup (MVP-9, D51): at start and once an hour — so a backup also appears after midnight.
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
  // The server and connection file go away together with the app: agents get a clear error.
  void agentApi?.shutdown()
  db?.close()
  db = null
})
