# Invisible AI Overlay (ghostpane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-first Electron desktop app that shows a screen-capture-excluded AI overlay, answers questions from a screenshot or typed prompt via the user's `claude` CLI subscription, and packages to a downloadable `.dmg`.

**Architecture:** Electron main process owns all OS-native behaviour (stealth window, global hotkeys, screen capture, `claude` CLI spawn). A React/Vite renderer is pure UI receiving streamed answer chunks over a typed `contextBridge` preload API. Business logic lives in small single-responsibility main-process modules, each unit-tested where it has real logic.

**Tech Stack:** Electron 33+, TypeScript 5, React 18, Vite 5, `electron-vite` (main+preload+renderer build), Vitest, electron-builder, `react-markdown`.

## Global Constraints

- Node ≥ 20 (dev machine has v25.2.1); npm ≥ 10 (has 11.6.2).
- macOS is the runtime target; Windows targets are *defined* in config but not built/tested in this plan. Linux unsupported (content-protection no-op).
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (preload needs Node for IPC types only). Renderer never gets Node/Electron directly — only `window.ghost`.
- Claude access is CLI shell-out only: spawn the `claude` binary resolved from PATH. Never set or read `ANTHROPIC_API_KEY`. No API-key UI.
- All main-process errors are caught and forwarded to the renderer status line; never throw to a dead window.
- Every task ends green (tests pass) and is committed. Commit messages end with the Co-Authored-By trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Package name: `ghostpane`. productName: `Ghostpane`. Bundle id: `com.ghostpane.app`.

---

## File Structure

```
ghostpane/
├── package.json
├── electron.vite.config.ts        # electron-vite: main/preload/renderer
├── tsconfig.json / tsconfig.node.json
├── vitest.config.ts
├── electron-builder.yml
├── src/
│   ├── shared/
│   │   ├── ipc.ts                 # channel name constants + payload types
│   │   └── shortcuts.ts           # DEFAULT_SHORTCUTS accelerator map
│   ├── main/
│   │   ├── index.ts               # app lifecycle, wires modules
│   │   ├── overlay-window.ts      # createOverlay(): stealth BrowserWindow
│   │   ├── register-shortcuts.ts  # globalShortcut → handler map
│   │   ├── screenshot.ts          # captureBehindOverlay(win): Buffer
│   │   ├── crop.ts                # pure crop/scale math (unit-tested)
│   │   └── claude.ts              # spawn claude CLI, stream (unit-tested)
│   ├── preload/
│   │   └── index.ts               # contextBridge window.ghost API
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx                # prompt input + streaming answer panel
│       ├── components/Answer.tsx  # markdown answer + status line
│       └── styles.css
├── tests/
│   ├── claude.test.ts
│   ├── crop.test.ts
│   └── register-shortcuts.test.ts
├── docs/SMOKE.md
├── .github/workflows/release.yml
└── README.md
```

---

### Task 1: Project scaffold — builds and opens a window

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`

**Interfaces:**
- Produces: an `electron-vite` project where `npm run dev` launches Electron showing the React app; `npm run build` compiles all three bundles.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ghostpane",
  "version": "0.1.0",
  "description": "Invisible AI overlay powered by your Claude subscription",
  "license": "MIT",
  "author": "",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "dist": "electron-vite build && electron-builder --mac"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.0",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src", "tests"]
}
```
`tsconfig.node.json`:
```json
{ "extends": "./tsconfig.json", "include": ["electron.vite.config.ts"] }
```

- [ ] **Step 3: Create `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: { build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } } },
  preload: { build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } } },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    plugins: [react()]
  }
})
```

- [ ] **Step 4: Create minimal main process `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 640,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 5: Create `src/preload/index.ts` (placeholder bridge)**

```ts
import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('ghost', { ping: () => 'pong' })
```

- [ ] **Step 6: Create renderer `src/renderer/index.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Ghostpane</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

- [ ] **Step 7: Create `src/renderer/main.tsx` and `src/renderer/App.tsx`**

`main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App'
createRoot(document.getElementById('root')!).render(<App />)
```
`App.tsx`:
```tsx
export function App() {
  return <div style={{ color: 'white', fontFamily: 'system-ui', padding: 16 }}>Ghostpane ready.</div>
}
```

- [ ] **Step 8: Install and verify dev build**

Run: `npm install` then `npm run build`
Expected: build completes, `out/main/index.js`, `out/preload/index.js`, and `out/renderer/index.html` exist.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold electron-vite + react app

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared IPC + shortcut definitions

**Files:**
- Create: `src/shared/ipc.ts`, `src/shared/shortcuts.ts`

**Interfaces:**
- Produces:
  - `CHANNELS` object with string channel names.
  - Types `AnswerChunk = { text: string }`, `AnswerError = { message: string }`, `AskRequest = { prompt: string; withScreenshot: boolean }`.
  - `MainEvent` union of semantic events: `'toggle' | 'ask-screenshot' | 'focus-input' | 'scroll-up' | 'scroll-down' | 'toggle-click-through' | 'quit'`.
  - `DEFAULT_SHORTCUTS: Record<MainEvent, string>` (macOS accelerators).

- [ ] **Step 1: Create `src/shared/ipc.ts`**

```ts
export const CHANNELS = {
  mainEvent: 'main:event',        // main → renderer: MainEvent
  ask: 'renderer:ask',            // renderer → main: AskRequest
  answerChunk: 'main:answer-chunk',
  answerDone: 'main:answer-done',
  answerError: 'main:answer-error',
  setClickThrough: 'renderer:set-click-through' // renderer → main: boolean
} as const

export type MainEvent =
  | 'toggle' | 'ask-screenshot' | 'focus-input'
  | 'scroll-up' | 'scroll-down' | 'toggle-click-through' | 'quit'

export interface AskRequest { prompt: string; withScreenshot: boolean }
export interface AnswerChunk { text: string }
export interface AnswerError { message: string }
```

- [ ] **Step 2: Create `src/shared/shortcuts.ts`**

```ts
import type { MainEvent } from './ipc'

export const DEFAULT_SHORTCUTS: Record<MainEvent, string> = {
  'toggle': 'CommandOrControl+\\',
  'ask-screenshot': 'CommandOrControl+Return',
  'focus-input': 'CommandOrControl+Shift+Space',
  'scroll-up': 'CommandOrControl+Up',
  'scroll-down': 'CommandOrControl+Down',
  'toggle-click-through': 'CommandOrControl+Shift+\\',
  'quit': 'CommandOrControl+Shift+Q'
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: shared IPC channels and default shortcut map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Claude CLI provider (unit-tested)

**Files:**
- Create: `src/main/claude.ts`, `tests/claude.test.ts`, `vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  interface AskOptions {
    prompt: string
    imagePath?: string
    onChunk: (text: string) => void
    onDone: () => void
    onError: (message: string) => void
    // injectable for tests; defaults to spawning `claude`
    spawnFn?: typeof import('child_process').spawn
    claudeBin?: string
  }
  export function ask(opts: AskOptions): void
  export class ClaudeUnavailable extends Error {}
  ```
- Behaviour: spawns `claude -p <prompt> --output-format stream-json --verbose` (adds the image path into the prompt text when `imagePath` set — see step 3). Parses newline-delimited JSON from stdout. For each JSON object where `type === 'assistant'`, extract text deltas from `message.content[].text` and call `onChunk`. On `type === 'result'` or process close(0) call `onDone`. On non-zero exit or spawn ENOENT call `onError` (ENOENT message: "Claude Code CLI not found on PATH. Install it and run `claude login`.").

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'] } })
```

- [ ] **Step 2: Write failing test `tests/claude.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { ask } from '../src/main/claude'

function fakeSpawn(lines: string[], exitCode = 0) {
  return () => {
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setTimeout(() => {
      for (const l of lines) child.stdout.emit('data', Buffer.from(l + '\n'))
      child.emit('close', exitCode)
    }, 0)
    return child
  }
}

describe('ask', () => {
  it('streams assistant text chunks then done', async () => {
    const chunks: string[] = []
    const lines = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: ' world' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success' })
    ]
    await new Promise<void>((resolve) => {
      ask({
        prompt: 'hi', onChunk: (t) => chunks.push(t),
        onDone: () => resolve(), onError: () => resolve(),
        spawnFn: fakeSpawn(lines) as any
      })
    })
    expect(chunks.join('')).toBe('Hello world')
  })

  it('reports error on non-zero exit', async () => {
    const msg = await new Promise<string>((resolve) => {
      ask({
        prompt: 'hi', onChunk: () => {}, onDone: () => resolve('DONE-unexpected'),
        onError: (m) => resolve(m), spawnFn: fakeSpawn(['garbage'], 1) as any
      })
    })
    expect(msg).not.toBe('DONE-unexpected')
  })
})
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npx vitest run tests/claude.test.ts`
Expected: FAIL (`ask` not found / module missing).

- [ ] **Step 4: Implement `src/main/claude.ts`**

```ts
import { spawn as realSpawn } from 'child_process'

export class ClaudeUnavailable extends Error {}

export interface AskOptions {
  prompt: string
  imagePath?: string
  onChunk: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
  spawnFn?: typeof realSpawn
  claudeBin?: string
}

export function ask(opts: AskOptions): void {
  const spawnFn = opts.spawnFn ?? realSpawn
  const bin = opts.claudeBin ?? 'claude'
  const prompt = opts.imagePath
    ? `${opts.prompt}\n\n[Screenshot saved at: ${opts.imagePath}] Read the image file at that path and answer.`
    : opts.prompt

  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
  let child
  try {
    child = spawnFn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    opts.onError((e as Error).message)
    return
  }

  let buf = ''
  let stderr = ''
  let done = false
  const finishOnce = (fn: () => void) => { if (!done) { done = true; fn() } }

  child.on('error', (e: NodeJS.ErrnoException) => {
    const msg = e.code === 'ENOENT'
      ? 'Claude Code CLI not found on PATH. Install it and run `claude login`.'
      : e.message
    finishOnce(() => opts.onError(msg))
  })

  child.stderr?.on('data', (d) => { stderr += d.toString() })

  child.stdout?.on('data', (d) => {
    buf += d.toString()
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let obj: any
      try { obj = JSON.parse(line) } catch { continue }
      if (obj.type === 'assistant' && obj.message?.content) {
        for (const block of obj.message.content) {
          if (block.type === 'text' && block.text) opts.onChunk(block.text)
        }
      }
    }
  })

  child.on('close', (code: number) => {
    if (code === 0) finishOnce(opts.onDone)
    else finishOnce(() => opts.onError(stderr.trim() || `claude exited with code ${code}`))
  })
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx vitest run tests/claude.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: claude CLI streaming provider with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Crop math (unit-tested pure function)

**Files:**
- Create: `src/main/crop.ts`, `tests/crop.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Rect { x: number; y: number; width: number; height: number }
  // Given a display's bounds (DIP), its scaleFactor, and a captured image
  // size in px, return the pixel rect covering the whole display.
  export function displayPixelRect(
    displayBounds: Rect, scaleFactor: number, imageWidth: number, imageHeight: number
  ): Rect
  ```
- Behaviour: returns `{ x:0, y:0, width: round(bounds.width*scale), height: round(bounds.height*scale) }` clamped to the image size. (We capture per-display, so origin is 0,0; the function centralizes the scale/clamp so multi-DPI is correct and testable. Kept deliberately small — YAGNI.)

- [ ] **Step 1: Write failing test `tests/crop.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { displayPixelRect } from '../src/main/crop'

describe('displayPixelRect', () => {
  it('scales DIP bounds by scaleFactor', () => {
    const r = displayPixelRect({ x: 0, y: 0, width: 1440, height: 900 }, 2, 2880, 1800)
    expect(r).toEqual({ x: 0, y: 0, width: 2880, height: 1800 })
  })
  it('clamps to the captured image size', () => {
    const r = displayPixelRect({ x: 0, y: 0, width: 1440, height: 900 }, 2, 2000, 1600)
    expect(r).toEqual({ x: 0, y: 0, width: 2000, height: 1600 })
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/crop.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/main/crop.ts`**

```ts
export interface Rect { x: number; y: number; width: number; height: number }

export function displayPixelRect(
  displayBounds: Rect, scaleFactor: number, imageWidth: number, imageHeight: number
): Rect {
  const width = Math.min(Math.round(displayBounds.width * scaleFactor), imageWidth)
  const height = Math.min(Math.round(displayBounds.height * scaleFactor), imageHeight)
  return { x: 0, y: 0, width, height }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/crop.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: display pixel-rect crop helper with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Screenshot capture module

**Files:**
- Create: `src/main/screenshot.ts`

**Interfaces:**
- Consumes: `displayPixelRect` from `crop.ts`.
- Produces:
  ```ts
  import type { BrowserWindow } from 'electron'
  // Hides the overlay, captures the display the overlay is on, restores it,
  // writes a PNG to a temp path, and returns that path.
  export async function captureBehindOverlay(win: BrowserWindow): Promise<string>
  ```
- Behaviour: `win.hide()`, wait one frame (~120ms), use `desktopCapturer.getSources({ types: ['screen'], thumbnailSize })` sized to the display's pixel dimensions (via `screen.getDisplayMatching(win.getBounds())`), pick the source whose `display_id` matches, `thumbnail.toPNG()`, write to `app.getPath('temp')/ghostpane-<n>.png`, `win.showInactive()`, return path. No unit test (Electron runtime + OS capture); covered by smoke test.

- [ ] **Step 1: Implement `src/main/screenshot.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: capture-behind-overlay screenshot module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Stealth overlay window

**Files:**
- Modify: `src/main/index.ts` (replace `createWindow` with a call into new module)
- Create: `src/main/overlay-window.ts`

**Interfaces:**
- Produces: `export function createOverlay(preloadPath: string, loadUrl: string | null): BrowserWindow`
- Behaviour: frameless, transparent, `alwaysOnTop` (`'screen-saver'`), `skipTaskbar`, `hasShadow:false`, `resizable:false`, `focusable:true` (so the input can receive typing when explicitly focused), shown with `showInactive()`. Calls `win.setContentProtection(true)`, `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenWorkspaces: true })`. On macOS sets `app.dock?.hide()` and `win.setWindowButtonVisibility(false)`.

- [ ] **Step 1: Create `src/main/overlay-window.ts`**

```ts
import { BrowserWindow, app } from 'electron'

export function createOverlay(preloadPath: string, loadUrl: string | null): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 640,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setContentProtection(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenWorkspaces: true })

  if (process.platform === 'darwin') {
    app.dock?.hide()
    win.setWindowButtonVisibility?.(false)
  }

  if (loadUrl) win.loadURL(loadUrl)
  else win.loadFile(require('path').join(__dirname, '../renderer/index.html'))

  win.once('ready-to-show', () => win.showInactive())
  return win
}
```

- [ ] **Step 2: Rewrite `src/main/index.ts` to use it**

```ts
import { app } from 'electron'
import { join } from 'path'
import { createOverlay } from './overlay-window'

let win: Electron.BrowserWindow | null = null

app.whenReady().then(() => {
  win = createOverlay(
    join(__dirname, '../preload/index.js'),
    process.env.ELECTRON_RENDERER_URL ?? null
  )
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 3: Build + manual launch check**

Run: `npm run build && npx electron-vite preview` (or `npm run dev`)
Expected: a translucent frameless window appears, not in the Dock. (Smoke items 1,2,5 verified in Task 10.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: stealth overlay window with content protection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Global shortcuts (unit-tested map builder)

**Files:**
- Create: `src/main/register-shortcuts.ts`, `tests/register-shortcuts.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `DEFAULT_SHORTCUTS`, `MainEvent`.
- Produces:
  ```ts
  export interface ShortcutDeps {
    register: (accelerator: string, cb: () => void) => boolean // wraps globalShortcut.register
  }
  // Returns the list of [event, accelerator, ok] registration results.
  export function registerShortcuts(
    onEvent: (e: MainEvent) => void,
    deps: ShortcutDeps,
    map?: Record<MainEvent, string>
  ): Array<{ event: MainEvent; accelerator: string; ok: boolean }>
  ```

- [ ] **Step 1: Write failing test `tests/register-shortcuts.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { registerShortcuts } from '../src/main/register-shortcuts'
import type { MainEvent } from '../src/shared/ipc'

describe('registerShortcuts', () => {
  it('registers every default shortcut and routes callbacks to events', () => {
    const callbacks: Record<string, () => void> = {}
    const register = vi.fn((acc: string, cb: () => void) => { callbacks[acc] = cb; return true })
    const events: MainEvent[] = []
    const results = registerShortcuts((e) => events.push(e), { register })
    expect(results.length).toBe(7)
    expect(results.every((r) => r.ok)).toBe(true)
    // firing the toggle accelerator emits 'toggle'
    callbacks['CommandOrControl+\\']()
    expect(events).toContain('toggle')
  })

  it('marks ok=false when registration fails', () => {
    const register = vi.fn(() => false)
    const results = registerShortcuts(() => {}, { register })
    expect(results.every((r) => !r.ok)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/register-shortcuts.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/main/register-shortcuts.ts`**

```ts
import { DEFAULT_SHORTCUTS } from '../shared/shortcuts'
import type { MainEvent } from '../shared/ipc'

export interface ShortcutDeps {
  register: (accelerator: string, cb: () => void) => boolean
}

export function registerShortcuts(
  onEvent: (e: MainEvent) => void,
  deps: ShortcutDeps,
  map: Record<MainEvent, string> = DEFAULT_SHORTCUTS
): Array<{ event: MainEvent; accelerator: string; ok: boolean }> {
  return (Object.entries(map) as [MainEvent, string][]).map(([event, accelerator]) => {
    const ok = deps.register(accelerator, () => onEvent(event))
    return { event, accelerator, ok }
  })
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/register-shortcuts.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Wire into `src/main/index.ts`**

Replace the file with the full wiring (screenshot + claude + shortcuts + IPC):
```ts
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
      win.showInactive(); win.focus(); send(CHANNELS.mainEvent, 'focus-input')
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
```

- [ ] **Step 6: Typecheck + tests**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: global shortcuts + main-process event wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Preload bridge

**Files:**
- Modify: `src/preload/index.ts`

**Interfaces:**
- Produces `window.ghost`:
  ```ts
  interface GhostApi {
    onMainEvent(cb: (e: MainEvent) => void): void
    onAnswerChunk(cb: (c: { text: string }) => void): void
    onAnswerDone(cb: () => void): void
    onAnswerError(cb: (e: { message: string }) => void): void
    ask(req: AskRequest): void
    setClickThrough(val: boolean): void
  }
  ```

- [ ] **Step 1: Implement `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '../shared/ipc'
import type { MainEvent, AskRequest } from '../shared/ipc'

const api = {
  onMainEvent: (cb: (e: MainEvent) => void) =>
    ipcRenderer.on(CHANNELS.mainEvent, (_e, v) => cb(v)),
  onAnswerChunk: (cb: (c: { text: string }) => void) =>
    ipcRenderer.on(CHANNELS.answerChunk, (_e, v) => cb(v)),
  onAnswerDone: (cb: () => void) =>
    ipcRenderer.on(CHANNELS.answerDone, () => cb()),
  onAnswerError: (cb: (e: { message: string }) => void) =>
    ipcRenderer.on(CHANNELS.answerError, (_e, v) => cb(v)),
  ask: (req: AskRequest) => ipcRenderer.send(CHANNELS.ask, req),
  setClickThrough: (val: boolean) => ipcRenderer.send(CHANNELS.setClickThrough, val)
}

contextBridge.exposeInMainWorld('ghost', api)
export type GhostApi = typeof api
```

- [ ] **Step 2: Add renderer type declaration `src/renderer/ghost.d.ts`**

```ts
import type { GhostApi } from '../preload/index'
declare global { interface Window { ghost: GhostApi } }
export {}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: preload contextBridge ghost API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Renderer UI — prompt + streaming answer

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/Answer.tsx`, `src/renderer/styles.css`
- Modify: `src/renderer/main.tsx` (import styles)

**Interfaces:**
- Consumes: `window.ghost`.
- Produces: visible overlay UI. Text input (submit on Enter → `ghost.ask({ prompt, withScreenshot:false })`); a "Screenshot + Ask" button → `withScreenshot:true`; streaming answer panel that appends `onAnswerChunk`, clears on new ask, shows errors and a "thinking…" state; `focus-input` main event focuses the input; `scroll-up/down` scroll the answer panel.

- [ ] **Step 1: Create `src/renderer/styles.css`**

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: transparent; overflow: hidden;
  font-family: -apple-system, system-ui, sans-serif; }
#root { height: 100%; }
.app { height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 12px;
  color: #f2f2f2; background: rgba(18,18,20,0.72); backdrop-filter: blur(18px);
  border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); }
.row { display: flex; gap: 8px; }
.input { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
  color: #fff; border-radius: 8px; padding: 8px 10px; outline: none; font-size: 13px; }
.btn { background: rgba(120,120,255,0.28); border: 1px solid rgba(140,140,255,0.4);
  color: #fff; border-radius: 8px; padding: 8px 10px; font-size: 12px; cursor: pointer; }
.answer { flex: 1; overflow-y: auto; font-size: 13px; line-height: 1.5;
  white-space: pre-wrap; }
.answer pre { background: rgba(0,0,0,0.35); padding: 10px; border-radius: 8px; overflow-x: auto; }
.status { font-size: 11px; opacity: 0.6; }
.error { color: #ff8080; }
.hint { font-size: 10px; opacity: 0.45; }
```

- [ ] **Step 2: Create `src/renderer/components/Answer.tsx`**

```tsx
import Markdown from 'react-markdown'

export function Answer({ text, status, error }: { text: string; status: string; error: string }) {
  return (
    <div className="answer">
      {error ? <div className="error">{error}</div> : <Markdown>{text}</Markdown>}
      {status && !error ? <div className="status">{status}</div> : null}
    </div>
  )
}
```

- [ ] **Step 3: Rewrite `src/renderer/App.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Answer } from './components/Answer'

export function App() {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.ghost.onAnswerChunk((c) => { setAnswer((a) => a + c.text); setStatus('') })
    window.ghost.onAnswerDone(() => setStatus(''))
    window.ghost.onAnswerError((e) => { setError(e.message); setStatus('') })
    window.ghost.onMainEvent((e) => {
      if (e === 'focus-input') inputRef.current?.focus()
      if (e === 'scroll-up') answerRef.current?.scrollBy({ top: -120 })
      if (e === 'scroll-down') answerRef.current?.scrollBy({ top: 120 })
    })
  }, [])

  function beginAsk(withScreenshot: boolean) {
    setAnswer(''); setError(''); setStatus('Thinking…')
    window.ghost.ask({ prompt, withScreenshot })
  }

  return (
    <div className="app">
      <div className="row">
        <input
          ref={inputRef}
          className="input"
          placeholder="Ask Claude… (Enter to send)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') beginAsk(false) }}
        />
        <button className="btn" onClick={() => beginAsk(true)}>Shot+Ask</button>
      </div>
      <div ref={answerRef} style={{ flex: 1, overflow: 'auto' }}>
        <Answer text={answer} status={status} error={error} />
      </div>
      <div className="hint">⌘\ toggle · ⌘⏎ screenshot+ask · ⌘⇧Space focus · ⌘⇧\ click-through</div>
    </div>
  )
}
```

- [ ] **Step 4: Update `src/renderer/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 5: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: renderer prompt + streaming answer UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Smoke checklist + manual verification

**Files:**
- Create: `docs/SMOKE.md`

**Interfaces:** none (documentation + manual run).

- [ ] **Step 1: Create `docs/SMOKE.md`**

```markdown
# Ghostpane smoke test (macOS)

Run: `npm run dev`

1. Overlay visible to you; NOT in the Dock; NOT in Cmd+Tab.
2. Start a QuickTime "New Screen Recording" AND a Zoom "Share Screen":
   the overlay is ABSENT in Zoom's shared view (reliable). QuickTime is
   best-effort per macOS limitations — note the result.
3. Type a question, press Enter → streamed Claude answer appears.
   (Requires `claude login` done beforehand.)
4. Press ⌘⏎ over a visible on-screen question → screenshot answer appears.
5. Press ⌘⇧\ → clicks pass through to the app beneath (click-through on).
6. With overlay shown, type into an editor beneath it → keystrokes land in
   the editor (overlay did not steal focus).

Record pass/fail for each. Items 1–6 must pass for release.
```

- [ ] **Step 2: Run the smoke test manually**

Run: `npm run dev`, then walk items 1–6. Fix any failures before proceeding. (First ensure `claude login` has been run.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: macOS smoke test checklist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Packaging (.dmg) + release CI + README

**Files:**
- Create: `electron-builder.yml`, `.github/workflows/release.yml`, `README.md`, `LICENSE`
- Modify: `package.json` (already has `dist` script)

**Interfaces:** none.

- [ ] **Step 1: Create `electron-builder.yml`**

```yaml
appId: com.ghostpane.app
productName: Ghostpane
directories:
  output: release
files:
  - out/**/*
  - package.json
mac:
  category: public.app-category.productivity
  target:
    - dmg
  # Unsigned by default. To sign+notarize later, add identity + notarize config.
win:
  target:
    - nsis
```

- [ ] **Step 2: Create `LICENSE` (MIT)**

Insert the standard MIT License text with year 2026.

- [ ] **Step 3: Create `README.md`**

Include: what it is; the honest intended-use note (screen-capture exclusion is dual-use; using it to deceive a non-consenting party in a monitored interview/proctored exam is the user's responsibility); prerequisites (`claude` CLI installed + `claude login`); install (download `.dmg` from Releases, right-click → Open to bypass Gatekeeper on an unsigned build); macOS Screen Recording permission step; hotkey table (from `DEFAULT_SHORTCUTS`); the content-protection caveat table (Windows solid; macOS good for share/screenshots, best-effort vs some ScreenCaptureKit/QuickTime recorders; Linux unsupported); build-from-source steps.

- [ ] **Step 4: Create `.github/workflows/release.yml`**

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npm run dist
      - uses: softprops/action-gh-release@v2
        with:
          files: release/*.dmg
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  # windows job intentionally deferred; enable when Windows is a target.
```

- [ ] **Step 5: Build the DMG locally**

Run: `npm run dist`
Expected: `release/Ghostpane-0.1.0-*.dmg` (or arm64 variant) is produced and mounts/launches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: packaging, release CI, and README

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §2.1 content protection → Task 6. ✅
- §2.2 stealth props → Task 6. ✅
- §2.3 hotkey-first → Tasks 2, 7. ✅
- §2.4 screenshot pipeline → Tasks 4, 5, 7. ✅
- §2.5 Claude CLI → Task 3, wired Task 7. ✅
- §3 architecture / process boundaries → Tasks 1, 6, 8. ✅
- §4 components → Tasks 3–9. ✅
- §5 error handling → Task 3 (ENOENT/exit), Task 5 (permission), Task 7 (forwarding), Task 9 (UI). ✅
- §6 testing (Vitest units + smoke) → Tasks 3, 4, 7, 10. ✅
- §7 packaging/CI/README → Task 11. ✅
- §8 milestones map 1:1 to Tasks 1–11. ✅

**Placeholder scan:** README body (Task 11 step 3) and MIT text (step 2) are described rather than shown verbatim — acceptable as they are prose/boilerplate the implementer writes from the itemized checklist, not code. All code steps contain complete code.

**Type consistency:** `MainEvent`, `AskRequest`, `AnswerChunk`, `CHANNELS`, `ask()` signature, `captureBehindOverlay`, `createOverlay`, `registerShortcuts`, `displayPixelRect` names are consistent across producing and consuming tasks. ✅
