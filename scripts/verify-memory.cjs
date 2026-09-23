// Empirical proof that renderer memory stays flat across many answers.
//
// Run:  npm run verify:memory
//       GHOST_OUT=/path/to/other/out npm run verify:memory   (compare a build)
//
// It loads the REAL built renderer and preload, then drives it through many
// full ask cycles over the real IPC channels — status, streamed chunks, done —
// exactly as the main process does. After each cycle it forces GC in the
// renderer and samples the JS heap. A leak shows up as a heap that keeps
// climbing cycle after cycle; a bounded renderer settles onto a plateau.
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')

app.commandLine.appendSwitch('js-flags', '--expose-gc')

const OUT = process.env.GHOST_OUT || path.join(__dirname, '..', 'out')
const CYCLES = Number(process.env.CYCLES || 30)
const CHUNK = 12        // matches Claude's text_delta granularity
const TOKEN_GAP_MS = 2  // token cadence of a fast provider

const CH = {
  answerChunk: 'main:answer-chunk',
  answerDone: 'main:answer-done',
  status: 'main:status',
  config: 'main:config',
  resize: 'renderer:resize'
}

// A representative ghostpane answer: prose, a fenced code block, and KaTeX math.
const ANSWER = `Use a sliding window with a hash map.

\`\`\`python
def lengthOfLongestSubstring(s: str) -> int:
    seen, left, best = {}, 0, 0
    for right, ch in enumerate(s):
        if ch in seen and seen[ch] >= left:
            left = seen[ch] + 1
        seen[ch] = right
        best = max(best, right - left + 1)
    return best
\`\`\`

The window $[left, right]$ always holds distinct characters, so each index is
visited at most twice: $O(n)$ time and $O(\\min(n, \\Sigma))$ space, where
$\\Sigma$ is the alphabet.

- **Time:** $O(n)$ — each character enters and leaves the window once.
- **Space:** $O(\\min(n, \\Sigma))$ for the map.
- Amortised from $\\sum_{i=1}^{n} 1 = n$ advances per pointer.
`.repeat(4)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const MB = (bytes) => bytes / 1048576
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

// performance.memory is quantised and does not track real usage, so read the
// V8 heap through the DevTools protocol and the OS-level footprint through
// Electron. Both matter: the heap catches JS garbage, the footprint catches
// DOM and KaTeX allocations that never touch the JS heap.
async function sampleRenderer(win) {
  const dbg = win.webContents.debugger
  await dbg.sendCommand('HeapProfiler.collectGarbage')
  const heap = await dbg.sendCommand('Runtime.getHeapUsage')
  const pid = win.webContents.getOSProcessId()
  const metric = app.getAppMetrics().find((m) => m.pid === pid)
  return { heap: heap.usedSize, footprint: (metric && metric.memory.workingSetSize || 0) * 1024 }
}

// A harness that measures an idle renderer proves nothing. Confirm the answer
// actually rendered before trusting any number from this run.
function renderedLength(win) {
  return win.webContents.executeJavaScript(
    "(document.querySelector('.panel-body')?.innerText || '').length"
  )
}

// Sampling only after a forced GC measures what is RETAINED. The cost of
// re-rendering per token is transient garbage, so it shows up as the heap's
// in-flight high-water mark while the answer streams — sample that too.
async function runCycle(win) {
  const dbg = win.webContents.debugger
  let peak = 0
  const probe = async () => {
    const { usedSize } = await dbg.sendCommand('Runtime.getHeapUsage')
    if (usedSize > peak) peak = usedSize
  }

  win.webContents.send(CH.status, '💭 Thinking…')
  let sent = 0
  for (let i = 0; i < ANSWER.length; i += CHUNK) {
    win.webContents.send(CH.answerChunk, { text: ANSWER.slice(i, i + CHUNK) })
    await wait(TOKEN_GAP_MS)
    if (++sent % 25 === 0) await probe()
  }
  win.webContents.send(CH.answerDone)
  await wait(200) // let the last render and any pending flush settle
  await probe()
  return peak
}

async function run() {
  // The real app resizes the native window whenever the content height changes.
  // Honour it here so the measurement includes that cost.
  ipcMain.on(CH.resize, (_e, height) => {
    if (typeof height !== 'number' || !win || win.isDestroyed()) return
    const b = win.getBounds()
    const maxH = Math.floor(screen.getDisplayMatching(b).workArea.height * 0.85)
    const h = Math.max(64, Math.min(Math.round(height), maxH))
    if (h !== b.height) win.setBounds({ x: b.x, y: b.y, width: b.width, height: h })
  })

  const win = new BrowserWindow({
    width: 520, height: 120, show: false, frame: false, transparent: true,
    webPreferences: {
      preload: path.join(OUT, 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  await win.loadFile(path.join(OUT, 'renderer', 'index.html'))
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('HeapProfiler.enable')
  await win.webContents.debugger.sendCommand('Runtime.enable')
  win.webContents.send(CH.config, { provider: 'claude', model: '', models: [], logPath: '' })
  await wait(600)
  const startedAt = Date.now()

  console.log(`\n=== Renderer memory across ${CYCLES} answers ===`)
  console.log(`build: ${OUT}`)
  console.log(`answer: ${ANSWER.length} chars streamed in ${Math.ceil(ANSWER.length / CHUNK)} chunks\n`)
  console.log('cycle   renderer heap   footprint')
  console.log('------------------------------------')

  const heaps = []
  const footprints = []
  const inFlight = []
  let minRendered = Infinity
  for (let i = 1; i <= CYCLES; i++) {
    inFlight.push(await runCycle(win))
    minRendered = Math.min(minRendered, await renderedLength(win))
    const { heap, footprint } = await sampleRenderer(win)
    heaps.push(heap)
    footprints.push(footprint)
    if (i <= 3 || i % 5 === 0 || i === CYCLES) {
      console.log(
        String(i).padStart(5),
        (MB(heap).toFixed(2) + ' MB').padStart(13),
        (MB(footprint).toFixed(1) + ' MB').padStart(11)
      )
    }
  }

  if (!Number.isFinite(minRendered) || minRendered < 100) {
    console.log(`\n❌ INVALID — the renderer never showed an answer (shortest render: ${minRendered} chars).`)
    console.log('   The harness measured an idle window; these numbers mean nothing.')
    win.destroy(); app.quit(); process.exitCode = 2
    return
  }

  // Ignore the first few cycles: KaTeX fonts, lazy module init and the initial
  // DOM all land there and are one-time costs, not growth.
  const elapsedMs = Date.now() - startedAt
  const WARMUP = Math.min(5, Math.floor(CYCLES / 3))
  const baseline = mean(heaps.slice(WARMUP, WARMUP + 5))
  const settled = mean(heaps.slice(-5))
  const growth = settled - baseline
  const peak = Math.max(...heaps)
  const footGrowth = mean(footprints.slice(-5)) - mean(footprints.slice(WARMUP, WARMUP + 5))

  console.log('\nrendered answer (min over run):', minRendered, 'chars')
  console.log('baseline (post-warmup mean):', MB(baseline).toFixed(2), 'MB')
  console.log('settled  (final 5 mean):    ', MB(settled).toFixed(2), 'MB')
  console.log('peak heap:                  ', MB(peak).toFixed(2), 'MB')
  console.log('heap growth over the run:   ', (growth >= 0 ? '+' : '') + MB(growth).toFixed(2), 'MB')
  console.log('footprint growth:           ', (footGrowth >= 0 ? '+' : '') + MB(footGrowth).toFixed(2), 'MB')
  console.log('wall clock per answer:      ', (elapsedMs / CYCLES).toFixed(0), 'ms')
  console.log('\n-- transient cost while streaming (what per-token rendering drives) --')
  console.log('in-flight heap, mean peak:  ', MB(mean(inFlight.slice(WARMUP))).toFixed(2), 'MB')
  console.log('in-flight heap, worst peak: ', MB(Math.max(...inFlight)).toFixed(2), 'MB')

  const FLAT_MB = 2
  const flat = MB(growth) < FLAT_MB
  if (flat) {
    console.log(`\n✅ FLAT — heap grew less than ${FLAT_MB}MB across ${CYCLES} answers.`)
  } else {
    console.log(`\n❌ GROWING — heap grew ${MB(growth).toFixed(2)}MB across ${CYCLES} answers.`)
  }
  win.destroy()
  app.quit()
  process.exitCode = flat ? 0 : 1
}

app.whenReady().then(run).catch((err) => {
  console.error('\n❌ HARNESS FAILED —', err && err.message ? err.message : err)
  app.quit()
  process.exitCode = 2
})
