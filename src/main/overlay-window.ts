import { BrowserWindow, app, screen } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { shell } from 'electron'
import { installNavigationGuards } from './navigation'
import { OVERLAY_SURFACE_OPTIONS } from './overlay-options'

// Makes the overlay follow the user everywhere: above all windows, onto every
// Space, and over other apps' full-screen windows. skipTransformProcessType is
// required for a dock-hidden (accessory) app to keep joining all Spaces without
// macOS flipping its activation policy. Safe to call repeatedly (re-assert on show).
export function applyFollowBehavior(win: BrowserWindow): void {
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  // NOTE: the option is `visibleOnFullScreen` — NOT `visibleOnFullScreenWorkspaces`.
  // Passing the wrong key (and casting past TS) silently disabled over-fullscreen
  // visibility, which is why the overlay never appeared over full-screen apps.
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  })
}

export function createOverlay(preloadPath: string, loadUrl: string | null): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 120, // small to start; resizes to fit content (see resize IPC)
    show: false,
    frame: false,
    ...OVERLAY_SURFACE_OPTIONS,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    // macOS: a 'panel' window gets NSWindowStyleMaskNonactivatingPanel, letting it
    // float OVER other apps' full-screen Spaces (like Spotlight) without stealing
    // focus. A normal NSWindow cannot appear over another app's full-screen space.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setContentProtection(true)

  if (process.platform === 'darwin') {
    app.dock?.hide()
    win.setWindowButtonVisibility?.(false)
  }

  applyFollowBehavior(win)

  // Anchor near the top-center so the window grows downward as answers stream.
  const wa = screen.getPrimaryDisplay().workArea
  win.setPosition(Math.round(wa.x + (wa.width - 520) / 2), wa.y + 48)

  const rendererFile = join(__dirname, '../renderer/index.html')
  const trustedRendererUrl = loadUrl ?? pathToFileURL(rendererFile).toString()
  installNavigationGuards(win, trustedRendererUrl, (url) => shell.openExternal(url))

  if (loadUrl) win.loadURL(loadUrl)
  else win.loadFile(rendererFile)

  win.once('ready-to-show', () => win.showInactive())
  return win
}
