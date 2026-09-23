import { desktopCapturer, screen, app, systemPreferences, nativeImage, BrowserWindow } from 'electron'
import { readdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { captureThumbnailSize } from './crop'
import { staleCaptureFiles } from './stale-captures'
import { log } from './logger'

let counter = 0

// Long-edge ceiling for a capture. Above this the bitmap cost grows fast for
// no legibility gain — desktopCapturer builds one per connected display.
const MAX_CAPTURE_EDGE = 2560

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

// Older than any ask could still be using, so this cannot delete a live capture.
const STALE_CAPTURE_MS = 3_600_000

// Captures are deleted when their ask finishes; a crash skips that. Sweep the
// leftovers once at startup so they do not accumulate for the life of the install.
export async function sweepStaleCaptures(): Promise<void> {
  const dir = app.getPath('temp')
  try {
    const stale = staleCaptureFiles(await readdir(dir), Date.now(), STALE_CAPTURE_MS)
    await Promise.all(stale.map((name) => unlink(join(dir, name)).catch(() => {})))
    if (stale.length) log('info', 'removed abandoned screenshots', { count: stale.length })
  } catch (e) {
    log('warn', 'stale screenshot sweep failed', { message: (e as Error).message })
  }
}

// A local model pays for every image token in prefill time on the user's own
// machine, and resizes internally anyway. Send it a smaller JPEG so a
// screenshot ask starts answering in seconds rather than a minute.
const LOCAL_IMAGE_EDGE = 1344

export async function localImageDataUrl(path: string): Promise<string> {
  const image = nativeImage.createFromPath(path)
  const size = image.getSize()
  const target = captureThumbnailSize({ x: 0, y: 0, ...size }, 1, LOCAL_IMAGE_EDGE)
  const scaled = target.width < size.width ? image.resize({ ...target, quality: 'best' }) : image
  return `data:image/jpeg;base64,${scaled.toJPEG(88).toString('base64')}`
}

export const PERM_HELP =
  'Screen Recording permission needed. 1) Make sure Ghostpane is in your ' +
  'Applications folder (NOT opened from the disk image). 2) Enable "Ghostpane" ' +
  'under System Settings → Privacy & Security → Screen Recording (I just opened it). ' +
  '3) QUIT (⌘⇧Q) and reopen. If it was already checked, UNcheck and re-check it. ' +
  'After replacing the app, macOS may ask you to re-enable it.'

export async function captureBehindOverlay(win: BrowserWindow): Promise<string> {
  const perm = screenPermission()
  log('info', 'screenshot: permission status', { status: perm })

  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const wasVisible = win.isVisible()
  if (wasVisible) win.hide()
  await new Promise((r) => setTimeout(r, 120))

  try {
    const thumbnailSize = captureThumbnailSize(display.bounds, display.scaleFactor, MAX_CAPTURE_EDGE)
    const opts = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize }
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
    await writeFile(path, png, { mode: 0o600 })
    return path
  } finally {
    if (wasVisible) win.showInactive()
  }
}
