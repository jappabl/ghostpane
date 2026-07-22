import { app, globalShortcut, ipcMain, screen, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { createOverlay, applyFollowBehavior } from './overlay-window'
import { registerShortcuts } from './register-shortcuts'
import { captureBehindOverlay, screenPermission, warmUpCapture } from './screenshot'
import { ask, resolveClaude } from './claude'
import { initLogger, getLogPath, getLogDir, log } from './logger'
import { getSettings, setModel } from './settings'
import { CHANNELS, type MainEvent, type AskRequest, type AppConfig } from '../shared/ipc'
import { OwnedPaths } from './owned-paths'

let win: BrowserWindow | null = null
let clickThrough = false
let busy = false // an ask (capture + Claude) is in flight; ignore new ones
const activeOwners = new Set<OwnedPaths>()

function send(channel: string, payload?: unknown) {
  win?.webContents.send(channel, payload)
}

// Show the overlay without stealing focus, re-asserting its follow-everywhere
// behaviour (survives Space switches and other apps going full-screen).
function reveal() {
  if (!win) return
  applyFollowBehavior(win)
  win.showInactive()
}

let screenSettingsOpened = false
function openScreenRecordingSettings() {
  if (screenSettingsOpened) return // don't spam-open when the user retries
  screenSettingsOpened = true
  log('info', 'opening Screen Recording settings pane')
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture').catch(() => {})
}

function onScreenshotError(err: unknown) {
  busy = false
  log('error', 'screenshot capture failed', err)
  // Only nudge toward Settings when permission is actually the problem.
  if (screenPermission() !== 'granted') openScreenRecordingSettings()
  reveal()
  send(CHANNELS.answerError, { message: (err as Error).message })
}

function pushConfig() {
  const settings = getSettings()
  const cfg: AppConfig = {
    provider: settings.provider,
    model: settings.models[settings.provider],
    logPath: getLogPath()
  }
  send(CHANNELS.config, cfg)
}

function runAsk(prompt: string, imagePath?: string) {
  busy = true
  const owned = new OwnedPaths()
  activeOwners.add(owned)
  if (imagePath) owned.add(imagePath)
  const finish = () => {
    busy = false
    activeOwners.delete(owned)
    void owned.cleanup()
  }
  reveal() // ensure the answer/error is actually visible
  send(CHANNELS.status, imagePath ? '📸 Reading your screen…' : '💭 Thinking…')
  ask({
    prompt: prompt || 'Read the question or content on screen and answer concisely.',
    imagePath,
    model: getSettings().models[getSettings().provider],
    onChunk: (text) => send(CHANNELS.answerChunk, { text }),
    onDone: () => { finish(); send(CHANNELS.answerDone) },
    onError: (message) => { finish(); log('error', 'ask error surfaced to UI', { message }); send(CHANNELS.answerError, { message }) },
    onLog: (level, msg, extra) => log(level, msg, extra)
  })
}

async function handleEvent(e: MainEvent) {
  if (!win) return
  log('info', 'shortcut', { event: e })
  switch (e) {
    case 'toggle':
      win.isVisible() ? win.hide() : reveal()
      break
    case 'focus-input':
      // The ONLY place we deliberately take focus — the user explicitly asked
      // to type. app.focus({steal}) is needed for a dock-hidden accessory app
      // to actually receive keystrokes on macOS. Everywhere else stays inactive.
      applyFollowBehavior(win)
      win.show()
      if (process.platform === 'darwin') app.focus({ steal: true })
      win.focus()
      send(CHANNELS.mainEvent, 'focus-input')
      break
    case 'ask-screenshot':
      if (busy) { log('info', 'ignoring ⌘⏎ — an ask is already in flight'); break }
      busy = true
      reveal() // make results visible; capture restores this state
      send(CHANNELS.status, '📸 Taking screenshot…')
      try {
        const path = await captureBehindOverlay(win)
        log('info', 'screenshot captured', { path })
        runAsk('', path) // keeps busy=true, sends its own status, clears on finish
      } catch (err) {
        onScreenshotError(err) // clears busy
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
  const exe = app.getPath('exe')
  const translocated = exe.includes('/AppTranslocation/')
  const inApplications = exe.includes('/Applications/')
  log('info', 'app location', { exe, translocated, inApplications })
  if (translocated) log('warn', 'APP IS TRANSLOCATED — move Ghostpane to /Applications; permissions will not stick until you do')
  const claude = resolveClaude()
  log(claude.found ? 'info' : 'warn', 'claude resolution', { bin: claude.bin, found: claude.found })
  log('info', 'screen recording permission', { status: screenPermission() })
  warmUpCapture() // prime ScreenCaptureKit so the first ⌘⏎ works immediately

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
    if (busy) { log('info', 'ignoring UI ask — an ask is already in flight'); return }
    log('info', 'ask from UI', { withScreenshot: req.withScreenshot, promptLen: req.prompt.length })
    if (req.withScreenshot && win) {
      busy = true
      reveal()
      captureBehindOverlay(win)
        .then((path) => runAsk(req.prompt, path))
        .catch((err) => onScreenshotError(err))
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
app.on('will-quit', () => { for (const owner of activeOwners) void owner.cleanup() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
