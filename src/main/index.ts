import { app, globalShortcut, ipcMain, BrowserWindow } from 'electron'
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
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
