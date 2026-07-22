import { desktopCapturer, screen, app, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { displayPixelRect } from './crop'

let counter = 0

export async function captureBehindOverlay(win: BrowserWindow): Promise<string> {
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
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: px.width, height: px.height }
    })
    const source =
      sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0]
    if (!source) throw new Error('No screen source available (grant Screen Recording permission).')
    const png = source.thumbnail.toPNG()
    if (png.length === 0) {
      throw new Error('Empty screenshot — grant Screen Recording permission in System Settings.')
    }
    const path = join(app.getPath('temp'), `ghostpane-${Date.now()}-${counter++}.png`)
    await writeFile(path, png)
    return path
  } finally {
    if (wasVisible) win.showInactive()
  }
}
