import { BrowserWindow, app, screen } from 'electron'
import { join } from 'path'

export function createOverlay(preloadPath: string, loadUrl: string | null): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 120, // small to start; resizes to fit content (see resize IPC)
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setContentProtection(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenWorkspaces: true } as Electron.VisibleOnAllWorkspacesOptions)

  if (process.platform === 'darwin') {
    app.dock?.hide()
    win.setWindowButtonVisibility?.(false)
  }

  // Anchor near the top-center so the window grows downward as answers stream.
  const wa = screen.getPrimaryDisplay().workArea
  win.setPosition(Math.round(wa.x + (wa.width - 520) / 2), wa.y + 48)

  if (loadUrl) win.loadURL(loadUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  win.once('ready-to-show', () => win.showInactive())
  return win
}
