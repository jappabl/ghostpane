import { app, globalShortcut, ipcMain, screen, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { createOverlay, applyFollowBehavior } from './overlay-window'
import { registerShortcuts, syncAudioSetupShortcut } from './register-shortcuts'
import { captureBehindOverlay, localImageDataUrl, screenPermission, sweepStaleCaptures, warmUpCapture } from './screenshot'
import { ask as askClaude, resolveClaude } from './claude'
import { askOpenAI, resolveCodex } from './openai'
import { askLocal, discoverLocalServer, localModelOptions, waitForServer } from './local-llm'
import { LocalLauncher } from './local-launcher'
import { layoutScreenText } from './screen-text'
import { modelsForProvider } from '../shared/providers'
import { initLogger, getLogPath, getLogDir, log } from './logger'
import { getSettings, setModel, setProvider } from './settings'
import { CHANNELS, type MainEvent, type AppConfig } from '../shared/ipc'
import { OwnedPaths } from './owned-paths'
import {
  isTrustedSender,
  parseAskRequest,
  parseBoolean,
  parseModel,
  parseProvider,
  parseResize
} from './ipc-validation'
import { isExternalHttpsUrl } from './navigation'
import { routeAsk } from './provider-router'
import { NativeHelper, resolveNativeHelperPath, type NativeHelperEvent } from './native-helper'
import { buildAudioPrompt } from './audio-context'
import { AUDIO_SHORTCUT } from '../shared/shortcuts'

let win: BrowserWindow | null = null
let clickThrough = false
let busy = false // an ask (capture + Claude) is in flight; ignore new ones
let audioActive = false
let audioPermissionRequestSent = false
let nativeHelper: NativeHelper | null = null
const activeOwners = new Set<OwnedPaths>()
const localLauncher = new LocalLauncher()

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

let configSeq = 0
async function pushConfig() {
  const seq = ++configSeq
  const settings = getSettings()
  const provider = settings.provider
  const models = provider === 'local'
    ? localModelOptions(await discoverLocalServer())
    : modelsForProvider(provider)
  if (seq !== configSeq) return // a newer push (e.g. the user switched provider) wins
  const saved = settings.models[provider]
  const cfg: AppConfig = {
    provider,
    // A saved local model the server no longer has shows as Auto — what will run.
    model: models.some((m) => m.id === saved) ? saved : '',
    models,
    logPath: getLogPath()
  }
  send(CHANNELS.config, cfg)
}

// Picking Local should just work: when nothing is running but a runtime is
// installed, start it, then fill the model menu once it answers.
async function connectLocal() {
  await pushConfig()
  if (await discoverLocalServer()) return
  const runtime = localLauncher.start()
  if (!runtime) return
  log('info', 'starting local runtime', { runtime })
  await waitForServer({}, 20_000)
  await pushConfig()
}

const PROVIDER_LABELS = { openai: 'ChatGPT', claude: 'Claude', local: 'your local model' } as const

function runAsk(prompt: string, imagePath?: string) {
  busy = true
  const settings = getSettings()
  const owned = new OwnedPaths(undefined, (path, error) => {
    log('warn', 'temporary screenshot cleanup failed', { path, error })
  })
  activeOwners.add(owned)
  if (imagePath) owned.add(imagePath)
  const finish = () => {
    busy = false
    activeOwners.delete(owned)
    void owned.cleanup()
    if (settings.provider === 'local') void pushConfig() // the ask may have started the server
  }
  reveal() // ensure the answer/error is actually visible
  const providerLabel = PROVIDER_LABELS[settings.provider]
  send(CHANNELS.status, imagePath
    ? `📸 Asking ${providerLabel} about your screen…`
    : `💭 Asking ${providerLabel}…`)
  const helper = nativeHelper
  const local = (options: Parameters<typeof askLocal>[0]) => askLocal({
    ...options,
    startServer: async () => localLauncher.start(),
    imageDataUrl: localImageDataUrl,
    // On-device OCR in the native helper, so a text-only model can still read the screen.
    readScreenText: helper?.running
      ? async (path) => layoutScreenText(await helper.recognizeText(path))
      : undefined
  })
  routeAsk(settings.provider, { openai: askOpenAI, claude: askClaude, local }, {
    prompt: prompt || 'Read the question or content on screen and answer concisely.',
    imagePath,
    model: settings.models[settings.provider],
    onChunk: (text) => send(CHANNELS.answerChunk, { text }),
    onDone: () => { finish(); send(CHANNELS.answerDone) },
    onError: (message) => { finish(); log('error', 'ask error surfaced to UI', { message }); send(CHANNELS.answerError, { message }) },
    onLog: (level, msg, extra) => log(level, msg, extra)
  })
}

async function runAudioAsk(microphoneTranscript: string, systemTranscript: string) {
  if (!win) return
  reveal()
  send(CHANNELS.status, '📸 Capturing current screen context…')
  try {
    const path = await captureBehindOverlay(win)
    log('info', 'audio-context screenshot captured', { path })
    runAsk(buildAudioPrompt('', microphoneTranscript, systemTranscript), path)
  } catch (err) {
    onScreenshotError(err)
  }
}

function syncAudioFallback(canOwnHotkey: boolean) {
  const ok = syncAudioSetupShortcut(canOwnHotkey, () => {
    if (!audioPermissionRequestSent) {
      audioPermissionRequestSent = true
      nativeHelper?.send('request-permissions')
    }
    reveal()
    send(CHANNELS.answerError, {
      message: 'Held audio uses ⌘⇧⏎ and requires Accessibility, Microphone, Screen Recording, and Speech Recognition access. Grant them in Privacy & Security, reopen Ghostpane if macOS asks, then hold the shortcut again.'
    })
  }, {
    register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
    unregister: (accelerator) => globalShortcut.unregister(accelerator),
    isRegistered: (accelerator) => globalShortcut.isRegistered(accelerator)
  })
  log(ok ? 'info' : 'warn', canOwnHotkey ? 'native audio shortcut active' : 'audio setup fallback shortcut', {
    accelerator: AUDIO_SHORTCUT,
    ok
  })
}

function updateNativePermissions(event: NativeHelperEvent) {
  if (!event.permissions) return
  log('info', 'native helper permissions', event.permissions)
  syncAudioFallback(event.permissions.canOwnHotkey)
}

function onNativeHelperEvent(event: NativeHelperEvent) {
  switch (event.type) {
    case 'ready':
    case 'permission-state':
      updateNativePermissions(event)
      break
    case 'tap':
      log('info', 'ignoring legacy native tap event')
      break
    case 'hold-started':
      if (busy) {
        nativeHelper?.send('cancel')
        break
      }
      busy = true
      audioActive = true
      reveal()
      send(CHANNELS.recording, { active: true, elapsedMs: 0 })
      send(CHANNELS.status, '🎙️ Recording microphone + system audio…')
      break
    case 'hold-progress':
      if (audioActive) send(CHANNELS.recording, { active: true, elapsedMs: event.elapsedMs ?? 0 })
      break
    case 'transcribing':
      if (!audioActive) break
      send(CHANNELS.recording, { active: false, elapsedMs: 0 })
      send(CHANNELS.status, '🎙️ Transcribing audio locally…')
      break
    case 'hold-finished':
      if (!audioActive) break
      audioActive = false
      send(CHANNELS.recording, { active: false, elapsedMs: 0 })
      void runAudioAsk(event.microphoneTranscript ?? '', event.systemTranscript ?? '')
      break
    case 'hold-cancelled':
      if (!audioActive) break
      audioActive = false
      busy = false
      send(CHANNELS.recording, { active: false, elapsedMs: 0 })
      send(CHANNELS.status, '')
      break
    case 'error':
      if (audioActive) {
        audioActive = false
        busy = false
        send(CHANNELS.recording, { active: false, elapsedMs: 0 })
      }
      reveal()
      send(CHANNELS.answerError, { message: event.message ?? 'The audio helper failed.' })
      break
  }
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
  const codex = resolveCodex()
  log(codex.found ? 'info' : 'warn', 'codex resolution', { bin: codex.bin, found: codex.found })
  log('info', 'screen recording permission', { status: screenPermission() })
  warmUpCapture() // prime ScreenCaptureKit so the first ⌘⏎ works immediately
  void sweepStaleCaptures() // clear screenshots a previous crash abandoned

  win = createOverlay(
    join(__dirname, '../preload/index.js'),
    process.env.ELECTRON_RENDERER_URL ?? null
  )

  win.webContents.on('did-finish-load', () => {
    void (getSettings().provider === 'local' ? connectLocal() : pushConfig())
  })

  const results = registerShortcuts(handleEvent, {
    register: (acc, cb) => globalShortcut.register(acc, cb)
  })
  for (const r of results) {
    if (!r.ok) log('warn', 'shortcut FAILED to register (conflict?)', { event: r.event, accelerator: r.accelerator })
  }
  log('info', 'shortcuts registered', { ok: results.filter((r) => r.ok).length, total: results.length })

  nativeHelper = new NativeHelper(
    resolveNativeHelperPath(app.isPackaged, process.resourcesPath, app.getAppPath()),
    {
      onEvent: onNativeHelperEvent,
      onUnavailable: (message) => {
        log('warn', message)
        if (audioActive) {
          audioActive = false
          busy = false
          send(CHANNELS.recording, { active: false, elapsedMs: 0 })
          send(CHANNELS.answerError, { message })
        }
        syncAudioFallback(false)
      },
      onLog: log
    }
  )
  nativeHelper.start()

  ipcMain.on(CHANNELS.ask, (event, value: unknown) => {
    if (!win || !isTrustedSender(event, win)) return
    const req = parseAskRequest(value)
    if (!req) { log('warn', 'rejected invalid ask IPC'); return }
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

  ipcMain.on(CHANNELS.setClickThrough, (event, value: unknown) => {
    if (!win || !isTrustedSender(event, win)) return
    const val = parseBoolean(value)
    if (val === null) return
    clickThrough = val
    win?.setIgnoreMouseEvents(val, { forward: true })
  })

  ipcMain.on(CHANNELS.setProvider, (event, value: unknown) => {
    if (!win || !isTrustedSender(event, win)) return
    const provider = parseProvider(value)
    if (!provider) return
    setProvider(provider)
    void (provider === 'local' ? connectLocal() : pushConfig())
  })

  ipcMain.on(CHANNELS.setModel, (event, value: unknown) => {
    if (!win || !isTrustedSender(event, win)) return
    const provider = getSettings().provider
    const model = parseModel(provider, value)
    if (model === null) return
    setModel(model, provider)
    void pushConfig()
  })

  ipcMain.on(CHANNELS.openExternal, (event, value: unknown) => {
    if (!win || !isTrustedSender(event, win)) return
    if (typeof value === 'string' && isExternalHttpsUrl(value)) void shell.openExternal(value)
  })

  const MIN_H = 64
  ipcMain.on(CHANNELS.resize, (event, value: unknown) => {
    if (!win || !isTrustedSender(event, win)) return
    const height = parseResize(value)
    if (height === null) return
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

app.on('will-quit', () => nativeHelper?.stop())
app.on('will-quit', () => localLauncher.stop()) // only a server Ghostpane itself started
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('will-quit', () => { for (const owner of activeOwners) void owner.cleanup() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
