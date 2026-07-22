import { desktopCapturer, screen, app, systemPreferences, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { displayPixelRect } from './crop'
import { log } from './logger'

let counter = 0

export function screenPermission(): string {
  try { return systemPreferences.getMediaAccessStatus('screen') } catch { return 'unknown' }
}

// ScreenCaptureKit's first getSources call after launch is often slow/fails cold.
// Warm it up at startup so the user's first ⌘⏎ doesn't hit that.
export async function warmUpCapture(): Promise<void> {
  if (screenPermission() !== 'granted') return
  try {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    log('info', 'capture pipeline warmed up')
  } catch (e) {
    log('warn', 'capture warm-up failed (will retry on first use)', { message: (e as Error).message })
  }
}

export const PERM_HELP =
  'Screen Recording permission needed. 1) Make sure Ghostpane is in your ' +
  'Applications folder (NOT opened from the disk image). 2) Enable "Ghostpane" ' +
  'under System Settings → Privacy & Security → Screen Recording (I just opened it). ' +
  '3) QUIT (⌘⇧Q) and reopen. If it was already checked, UNcheck and re-check it. ' +
  'After an update you may need to re-enable it (unsigned app).'

export async function captureBehindOverlay(win: BrowserWindow): Promise<string> {
  const perm = screenPermission()
  log('info', 'screenshot: permission status', { status: perm })

  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const wasVisible = win.isVisible()
  if (wasVisible) win.hide()
  await new Promise((r) => setTimeout(r, 120))

  try {
    const px = displayPixelRect(
      display.bounds, display.scaleFactor,
      Math.round(display.bounds.width * display.scaleFactor),
      Math.round(display.bounds.height * display.scaleFactor)
    )
    const opts = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize: { width: px.width, height: px.height } }
    let sources
    try {
      sources = await desktopCapturer.getSources(opts)
    } catch (e) {
      const status = screenPermission()
      log('warn', 'getSources failed', { status, message: (e as Error).message })
      if (status !== 'granted') throw new Error(PERM_HELP)
      // Permission IS granted — this is a transient failure (first call after
      // launch, or a rapid retry). Wait a beat and try once more.
      await new Promise((r) => setTimeout(r, 250))
      try {
        sources = await desktopCapturer.getSources(opts)
      } catch (e2) {
        log('error', 'getSources failed again', { message: (e2 as Error).message })
        throw new Error('Screen capture failed — press ⌘⏎ again.')
      }
    }
    const source =
      sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0]
    if (!source) throw new Error(PERM_HELP)
    const png = source.thumbnail.toPNG()
    if (png.length === 0) throw new Error(PERM_HELP)
    const path = join(app.getPath('temp'), `ghostpane-${Date.now()}-${counter++}.png`)
    await writeFile(path, png)
    return path
  } finally {
    if (wasVisible) win.showInactive()
  }
}
