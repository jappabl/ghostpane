import { desktopCapturer, screen, app, systemPreferences, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { displayPixelRect } from './crop'
import { log } from './logger'

let counter = 0

export function screenPermission(): string {
  try { return systemPreferences.getMediaAccessStatus('screen') } catch { return 'unknown' }
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
    let sources
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: px.width, height: px.height }
      })
    } catch (e) {
      // The macOS "Failed to get sources" case — almost always missing permission.
      log('error', 'getSources threw', { status: screenPermission(), message: (e as Error).message })
      throw new Error(PERM_HELP)
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
