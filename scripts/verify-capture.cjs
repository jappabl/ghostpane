// Empirical proof that the screen-capture exclusion works.
//
// Run:  npm run verify:capture
//
// It shows a bright magenta MARKER window and captures the screen through the
// SAME path screen recorders use (ScreenCaptureKit via Electron's
// desktopCapturer), with content protection OFF -> ON -> OFF. If exclusion
// works, the marker is PRESENT when off, GONE when on, and PRESENT again.
//
// First run: macOS will add "Electron" to System Settings > Privacy & Security
// > Screen Recording (initially OFF) and captures come back black. Enable it,
// then run this again for real numbers + a verdict.
const { app, BrowserWindow, desktopCapturer, screen, systemPreferences } = require('electron')
const fs = require('fs')
const path = require('path')

const OUT = path.join(process.cwd(), 'verify-out')
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const WX = 300, WY = 300, WW = 520, WH = 340 // marker geometry (DIP)

function markerHtml() {
  return 'data:text/html,' + encodeURIComponent(
    `<body style="margin:0;background:#ff00aa;color:#fff;font:bold 56px system-ui;
      display:flex;align-items:center;justify-content:center;height:100vh">MARKER</body>`)
}

async function capture(name, sf) {
  const d = screen.getPrimaryDisplay()
  const pw = Math.round(d.size.width * sf), ph = Math.round(d.size.height * sf)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: pw, height: ph } })
  const src = sources[0]
  fs.writeFileSync(path.join(OUT, name + '.png'), src.thumbnail.toPNG())
  const bmp = src.thumbnail.getBitmap()
  const size = src.thumbnail.getSize()
  const x0 = Math.round(WX * sf), y0 = Math.round(WY * sf)
  const x1 = Math.round((WX + WW) * sf), y1 = Math.round((WY + WH) * sf)
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1 && y < size.height; y += 4)
    for (let x = x0; x < x1 && x < size.width; x += 4) {
      const i = (y * size.width + x) * 4
      b += bmp[i]; g += bmp[i + 1]; r += bmp[i + 2]; n++
    }
  const avg = n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : { r: 0, g: 0, b: 0 }
  return { name, marker: { r: avg.r, g: avg.g, b: avg.b }, markerPresent: avg.r > 150 && avg.g < 120 && avg.b > 90 }
}

app.whenReady().then(async () => {
  const perm = systemPreferences.getMediaAccessStatus('screen')
  const sf = screen.getPrimaryDisplay().scaleFactor
  const win = new BrowserWindow({ x: WX, y: WY, width: WW, height: WH, frame: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.loadURL(markerHtml())
  win.showInactive()
  await wait(1500)

  const off1 = await capture('01_OFF', sf)
  win.setContentProtection(true); await wait(1200)
  const on = await capture('02_ON', sf)
  win.setContentProtection(false); await wait(1200)
  const off2 = await capture('03_OFF_again', sf)

  const pass = off1.markerPresent && !on.markerPresent && off2.markerPresent
  const blackedOut = !off1.markerPresent && !on.markerPresent && !off2.markerPresent

  console.log('\n=== Screen-capture exclusion A/B test ===')
  console.log('screen-recording permission:', perm)
  console.log(`  OFF  -> marker present: ${off1.markerPresent}  rgb(${off1.marker.r},${off1.marker.g},${off1.marker.b})`)
  console.log(`  ON   -> marker present: ${on.markerPresent}  rgb(${on.marker.r},${on.marker.g},${on.marker.b})`)
  console.log(`  OFF  -> marker present: ${off2.markerPresent}  rgb(${off2.marker.r},${off2.marker.g},${off2.marker.b})`)
  console.log('images:', OUT)
  if (pass) {
    console.log('\n✅ PASS — the window is captured when protection is OFF and EXCLUDED when ON.')
  } else if (blackedOut) {
    console.log('\n⚠️  INCONCLUSIVE — every capture was blank. Enable "Electron" in')
    console.log('   System Settings > Privacy & Security > Screen Recording, then rerun.')
  } else {
    console.log('\n❌ UNEXPECTED — see the three PNGs in verify-out/ to inspect.')
  }
  win.close(); app.quit()
  process.exitCode = pass ? 0 : 1
})
