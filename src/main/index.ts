import { app, globalShortcut, ipcMain, screen, BrowserWindow } from 'electron'
import { join } from 'path'
import { createOverlay } from './overlay-window'
import { registerShortcuts } from './register-shortcuts'
import { captureBehindOverlay } from './screenshot'
import { ask } from './claude'
import { CHANNELS, type MainEvent, type AskRequest } from '../shared/ipc'

let win: BrowserWindow | null = null
let clickThrough = false

function send(channel: string, payload?: unknown) {
  win?.webContents.send(channel, payload)
}

function runAsk(prompt: string, imagePath?: string) {
  ask({
    prompt: prompt || 'Read the question or content on screen and answer concisely.',
    imagePath,
    onChunk: (text) => send(CHANNELS.answerChunk, { text }),
    onDone: () => send(CHANNELS.answerDone),
    onError: (message) => send(CHANNELS.answerError, { message })
  })
}

async function handleEvent(e: MainEvent) {
  if (!win) return
  switch (e) {
    case 'toggle':
      win.isVisible() ? win.hide() : win.showInactive()
      break
    case 'focus-input':
      // The ONLY place we deliberately take focus — the user explicitly asked
      // to type. app.focus({steal}) is needed for a dock-hidden accessory app
      // to actually receive keystrokes on macOS. Everywhere else stays inactive.
      win.show()
      if (process.platform === 'darwin') app.focus({ steal: true })
      win.focus()
      send(CHANNELS.mainEvent, 'focus-input')
      break
    case 'ask-screenshot':
      try {
        const path = await captureBehindOverlay(win)
        runAsk('', path)
      } catch (err) {
        send(CHANNELS.answerError, { message: (err as Error).message })
      }
      break
    case 'toggle-click-through':
      clickThrough = !clickThrough
      win.setIgnoreMouseEvents(clickThrough, { forward: true })
      send(CHANNELS.mainEvent, 'toggle-click-through')
      break
    case 'scroll-up': case 'scroll-down':
      send(CHANNELS.mainEvent, e)
      break
    case 'quit':
      app.quit()
      break
  }
}

app.whenReady().then(() => {
  win = createOverlay(
    join(__dirname, '../preload/index.js'),
    process.env.ELECTRON_RENDERER_URL ?? null
  )

  registerShortcuts(handleEvent, {
    register: (acc, cb) => globalShortcut.register(acc, cb)
  })

  ipcMain.on(CHANNELS.ask, (_e, req: AskRequest) => {
    if (req.withScreenshot && win) {
      captureBehindOverlay(win)
        .then((path) => runAsk(req.prompt, path))
        .catch((err) => send(CHANNELS.answerError, { message: (err as Error).message }))
    } else {
      runAsk(req.prompt)
    }
  })

  ipcMain.on(CHANNELS.setClickThrough, (_e, val: boolean) => {
    clickThrough = val
    win?.setIgnoreMouseEvents(val, { forward: true })
  })

  // Grow/shrink the window to fit the rendered content. The renderer reports
  // its natural content height; we clamp to the display and keep it on-screen.
  const MIN_H = 64
  ipcMain.on(CHANNELS.resize, (_e, height: number) => {
    if (!win) return
    const b = win.getBounds()
    const wa = screen.getDisplayMatching(b).workArea
    const maxH = Math.floor(wa.height * 0.85)
    const h = Math.max(MIN_H, Math.min(Math.round(height), maxH))
    if (h === b.height) return
    let y = b.y
    if (y + h > wa.y + wa.height) y = Math.max(wa.y, wa.y + wa.height - h)
    win.setBounds({ x: b.x, y, width: b.width, height: h })
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
