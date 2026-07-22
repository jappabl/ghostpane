import { app, globalShortcut, ipcMain, screen, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { createOverlay } from './overlay-window'
import { registerShortcuts } from './register-shortcuts'
import { captureBehindOverlay } from './screenshot'
import { ask, resolveClaude } from './claude'
import { initLogger, getLogPath, getLogDir, log } from './logger'
import { getSettings, setModel } from './settings'
import { CHANNELS, type MainEvent, type AskRequest, type AppConfig } from '../shared/ipc'

let win: BrowserWindow | null = null
let clickThrough = false

function send(channel: string, payload?: unknown) {
  win?.webContents.send(channel, payload)
}

function pushConfig() {
  const cfg: AppConfig = { model: getSettings().model, logPath: getLogPath() }
  send(CHANNELS.config, cfg)
}

function runAsk(prompt: string, imagePath?: string) {
  win?.showInactive() // ensure the answer/error is actually visible
  ask({
    prompt: prompt || 'Read the question or content on screen and answer concisely.',
    imagePath,
    model: getSettings().model,
    onChunk: (text) => send(CHANNELS.answerChunk, { text }),
    onDone: () => send(CHANNELS.answerDone),
    onError: (message) => { log('error', 'ask error surfaced to UI', { message }); send(CHANNELS.answerError, { message }) },
    onLog: (level, msg, extra) => log(level, msg, extra)
  })
}

async function handleEvent(e: MainEvent) {
  if (!win) return
  log('info', 'shortcut', { event: e })
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
      win.showInactive() // make results visible; capture restores this state
      try {
        const path = await captureBehindOverlay(win)
        log('info', 'screenshot captured', { path })
        runAsk('', path)
      } catch (err) {
        log('error', 'screenshot capture failed', err)
        win.showInactive()
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
    case 'open-logs':
      shell.openPath(getLogDir())
      break
    case 'quit':
      app.quit()
      break
  }
}

app.whenReady().then(() => {
  initLogger()
  const claude = resolveClaude()
  log(claude.found ? 'info' : 'warn', 'claude resolution', { bin: claude.bin, found: claude.found })

  win = createOverlay(
    join(__dirname, '../preload/index.js'),
    process.env.ELECTRON_RENDERER_URL ?? null
  )

  win.webContents.on('did-finish-load', pushConfig)

  const results = registerShortcuts(handleEvent, {
    register: (acc, cb) => globalShortcut.register(acc, cb)
  })
  for (const r of results) {
    if (!r.ok) log('warn', 'shortcut FAILED to register (conflict?)', { event: r.event, accelerator: r.accelerator })
  }
  log('info', 'shortcuts registered', { ok: results.filter((r) => r.ok).length, total: results.length })

  ipcMain.on(CHANNELS.ask, (_e, req: AskRequest) => {
    log('info', 'ask from UI', { withScreenshot: req.withScreenshot, promptLen: req.prompt.length })
    if (req.withScreenshot && win) {
      win.showInactive()
      captureBehindOverlay(win)
        .then((path) => runAsk(req.prompt, path))
        .catch((err) => { log('error', 'screenshot capture failed', err); win?.showInactive(); send(CHANNELS.answerError, { message: (err as Error).message }) })
    } else {
      runAsk(req.prompt)
    }
  })

  ipcMain.on(CHANNELS.setClickThrough, (_e, val: boolean) => {
    clickThrough = val
    win?.setIgnoreMouseEvents(val, { forward: true })
  })

  ipcMain.on(CHANNELS.setModel, (_e, model: string) => {
    setModel(model)
    pushConfig()
  })

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
