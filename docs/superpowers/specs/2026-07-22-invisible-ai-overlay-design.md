# Invisible AI Overlay — Design Spec

**Date:** 2026-07-22
**Codename:** `ghostpane` (working title)
**One-liner:** A desktop AI assistant that floats over your screen, answers questions from what it sees, and is excluded from screen-capture/screen-share — powered by your own Claude subscription.

---

## 1. Purpose & scope

Build an open-source desktop app (macOS first, Windows scaffolded) that:

1. Shows a translucent always-on-top overlay the user can summon/dismiss with a global hotkey.
2. Is **excluded from screen recording and screen sharing** (Zoom/Teams/Meet/OBS/QuickTime) via OS content-protection APIs.
3. Answers questions by (a) typed prompt and (b) **screenshot of the screen region behind the overlay**, sent to Claude.
4. Uses the user's **existing Claude Pro/Max subscription** by shelling out to the logged-in `claude` CLI — no API key, no per-token billing.
5. Ships as a downloadable `.dmg` from GitHub Releases; anyone can install and run with their own Claude Code login.

**Explicitly out of scope (YAGNI):** audio/meeting transcription, accounts/telemetry, auto-update server, Linux (content-protection is a no-op there), mobile, multi-provider LLM support.

**Intended-use note:** the screen-capture-exclusion capability is dual-use (password managers, DRM, and meeting tools use the same APIs). Using it to deceive a party who hasn't consented (e.g. a monitored interview or proctored exam) is on the end user. The README states this plainly.

---

## 2. The core techniques (grounded in research)

### 2.1 Screen-capture exclusion
`BrowserWindow.setContentProtection(true)` in Electron maps to:
- **Windows:** `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` — window dropped from *all* capture (share + record). Robust.
- **macOS:** `NSWindow.sharingType = NSWindowSharingNone` — reliable for screenshots and Zoom/Teams window/screen share. **Known caveat:** some ScreenCaptureKit recorders / QuickTime can still capture it. We document this honestly and do not overpromise.
- **Linux:** no-op → overlay visible. Not a target.

### 2.2 Overlay stealth properties
- Frameless, transparent background, `alwaysOnTop` at `screen-saver` level.
- **Non-activating**: `BrowserWindow` with `focusable` toggled + on macOS a panel that does not steal key focus, so the underlying app stays foregrounded and the overlay never appears in the app switcher.
- Excluded from Dock/taskbar (`skipTaskbar`, macOS `LSUIElement`/accessory activation policy) and from Mission Control / Alt-Tab.
- `setVisibleOnAllWorkspaces(true, { visibleOnFullScreenWorkspaces: true })` so it survives full-screen apps.
- Optional **click-through** (`setIgnoreMouseEvents(true, { forward: true })`) toggled by hotkey.

### 2.3 Interaction model — hotkey-first
The user should rarely move the mouse to the overlay (a cursor drifting to an invisible region is the human tell). All primary actions are `globalShortcut`s:

| Action | Default (macOS) |
|---|---|
| Show/hide overlay | `Cmd+\` |
| Ask (screenshot behind overlay → Claude) | `Cmd+Enter` |
| Focus prompt input to type a question | `Cmd+Shift+Space` |
| Scroll answer up / down | `Cmd+Up` / `Cmd+Down` |
| Move overlay (nudge) | `Cmd+Arrow` |
| Toggle click-through | `Cmd+Shift+\` |
| Quit | `Cmd+Shift+Q` |

Hotkeys are defined in one config map so they're easy to change.

### 2.4 Screenshot pipeline
On "Ask", the overlay briefly hides itself, captures the display (via Electron `desktopCapturer` / `screen` — the app's own capture is *not* subject to its own content-protection), re-shows, crops to the active display, and sends the PNG as an image block to Claude with the prompt (typed text if any, else a default "Read the question/content on screen and answer concisely.").

### 2.5 Claude via subscription (CLI shell-out)
Spawn the installed `claude` binary in headless streaming mode:

```
claude -p "<prompt>" --output-format stream-json --verbose \
  [--append-system-prompt "<persona>"]
```

For image input, write the screenshot to a temp file and reference it, or use the CLI's image support. The provider module streams stdout JSON lines → incremental tokens → renderer. This routes through the user's Pro/Max quota (no `ANTHROPIC_API_KEY` set). If `claude` is not found on PATH, show a clear setup message linking to Claude Code install + `claude login`.

---

## 3. Architecture

```
ghostpane/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.ts           # app lifecycle, creates overlay window
│   │   ├── overlay-window.ts # window factory: stealth props + content protection
│   │   ├── shortcuts.ts      # global hotkey registration → IPC events
│   │   ├── screenshot.ts     # capture display, crop, return PNG buffer
│   │   ├── claude.ts         # spawn `claude` CLI, stream results
│   │   └── ipc.ts            # typed IPC channel definitions
│   ├── preload/
│   │   └── preload.ts        # contextBridge: safe API to renderer
│   └── renderer/             # React UI (the visible overlay)
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx           # prompt box + streaming answer panel
│       ├── components/
│       └── styles.css
├── docs/
└── .github/workflows/release.yml   # tag → build .dmg → attach to Release
```

**Process boundaries**
- **Main**: owns all OS-native behaviour (window, hotkeys, capture, CLI spawn). No business logic in the renderer beyond display.
- **Preload**: exposes a minimal typed `window.ghost` API (`onEvent`, `ask`, `setClickThrough`, …) via `contextBridge`. `nodeIntegration: false`, `contextIsolation: true`.
- **Renderer**: pure UI. Receives streamed tokens, renders markdown answer, shows status.

**Data flow (Ask):**
```
hotkey → shortcuts.ts → screenshot.ts (PNG) → claude.ts (spawn, stream)
      → ipc 'answer:chunk' → preload → renderer appends → markdown render
```

---

## 4. Components (each independently testable)

| Unit | Responsibility | Interface | Depends on |
|---|---|---|---|
| `overlay-window.ts` | Create the stealth window | `createOverlay(): BrowserWindow` | Electron |
| `shortcuts.ts` | Map hotkeys → semantic events | `registerShortcuts(win, handlers)` | Electron `globalShortcut` |
| `screenshot.ts` | Capture + crop active display | `captureBehindOverlay(win): Promise<Buffer>` | Electron `desktopCapturer`/`screen` |
| `claude.ts` | Talk to Claude via CLI | `ask({prompt, imagePath?, onChunk, onDone, onError})` | child_process, `claude` |
| `preload.ts` | Bridge main↔renderer | `window.ghost` typed API | Electron IPC |
| `App.tsx` | Render prompt + streaming answer | React component | preload API |

The three units with real logic — `claude.ts` (parse stream-json), `screenshot.ts` (crop math), `shortcuts.ts` (map) — get unit tests. Window/stealth behaviour is verified by a manual smoke checklist (below) since it's OS-visual.

---

## 5. Error handling

- **`claude` not on PATH / not logged in:** provider throws a typed `ClaudeUnavailable`; UI shows "Claude Code not found — install & run `claude login`" with a link. Non-fatal; app stays usable for retry.
- **CLI non-zero exit / auth error / rate limit:** surface the stderr message in the answer panel, don't crash.
- **Screenshot failure (permission denied):** on macOS, Screen Recording permission is required; detect empty/failed capture and prompt the user to grant it in System Settings → Privacy → Screen Recording. (Note the irony: the app needs capture permission to screenshot, but its *own* window is still excluded from *others'* capture.)
- **Content-protection unsupported (Linux/older OS):** log a warning once; overlay still works but is visible.
- All main-process errors are caught and forwarded to the renderer status line; nothing throws to a dead window.

---

## 6. Testing strategy

**Automated (Vitest, run in CI + locally):**
- `claude.ts`: given canned `stream-json` stdout fixtures, emits correct ordered chunks and a final done; maps error exit to `onError`.
- `screenshot.ts`: crop math for multi-display / scale-factor cases (pure function extracted).
- `shortcuts.ts`: registration builds the expected accelerator→handler map; duplicate/failed registration handled.

**Manual smoke checklist (documented in `docs/SMOKE.md`, run on macOS):**
1. Launch → overlay visible to me, not in Dock, not in Alt-Tab.
2. Start a QuickTime screen recording + a Zoom "share screen" → overlay **absent** in both. (Zoom reliably; QuickTime documented as best-effort.)
3. Hotkey ask on a visible question → streamed Claude answer appears.
4. Click-through toggle → clicks pass to the app beneath.
5. Underlying app keeps focus when overlay shows (type into editor, overlay up, keystrokes still land in editor).

**Definition of done:** automated tests green; smoke checklist items 1–5 pass on this Mac; `npm run dist` produces a launchable `.dmg`.

---

## 7. Packaging & distribution

- `electron-builder` → `.dmg` (and NSIS `.exe` target defined for later).
- Unsigned first (Gatekeeper right-click-open documented in README); note where to add an Apple Developer ID cert + notarization later.
- `.github/workflows/release.yml`: on `v*` tag, macOS runner runs `npm run dist`, uploads `.dmg` to the GitHub Release. Windows job stubbed/commented for when we enable it.
- README: what it is, the honest intended-use note, install steps, Claude Code prerequisite, hotkey reference, the macOS Screen-Recording-permission step, and the content-protection caveat table.

---

## 8. Milestones (maps to the implementation plan)

1. **Scaffold** — Electron+Vite+TS+React, one plain window renders. Verify: `npm run dev` opens a window.
2. **Stealth overlay** — content protection + all stealth props. Verify: smoke items 1, 2, 5.
3. **Hotkeys + UI shell** — global shortcuts drive show/hide/focus; React prompt+answer panel. Verify: hotkeys toggle; typing works.
4. **Claude provider** — CLI streaming, unit-tested. Verify: typed question → streamed answer (smoke 3).
5. **Screenshot ask** — capture-behind-overlay → image to Claude. Verify: on-screen question answered.
6. **Click-through + polish** — toggle, status/error states. Verify: smoke 4, error paths.
7. **Package + CI + README** — `.dmg` builds locally and via tag. Verify: DoD.
