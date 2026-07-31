import { app, shell, BrowserWindow, session, nativeImage } from 'electron'
import { join } from 'node:path'
import appIcon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc/registry'
import { closeAll } from './weaviate/connectionManager'
import { migrateLegacyData } from './store/store'

// Display name for menus, About, notifications, and packaged builds. (In `dev`
// the macOS dock tooltip still shows "Electron" — that's the dev runner binary;
// the packaged app's bundle is named "Weavit UI".)
app.setName('Weavit UI')

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// A vector-DB client hits network failures routinely (dropped connections, bad
// ports, unreachable gRPC). The Weaviate/gRPC stack can surface those as async
// errors that aren't tied to an awaited call — e.g. a background health probe.
// Under Node 22 an unhandled rejection terminates the process, so we log and
// swallow these instead of letting a connection failure crash the whole app.
process.on('unhandledRejection', (reason) => {
  console.error('[weavit] unhandled rejection (ignored):', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[weavit] uncaught exception (ignored):', err)
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1115',
    title: 'Weavit UI',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open external links in the user's browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function applyProductionCsp(): void {
  if (isDev) return // avoid interfering with Vite HMR in development
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
        ]
      }
    })
  })
}

app.whenReady().then(() => {
  // Dock icon in dev on macOS (packaged builds use the .icns from the bundle).
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(appIcon))
  }
  migrateLegacyData()
  applyProductionCsp()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void closeAll()
})
