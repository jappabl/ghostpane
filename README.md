# Ghostpane

A translucent AI overlay that floats over your screen, answers questions from
what it sees, and is **excluded from screen recording and screen sharing** —
powered by *your own* Claude Pro/Max subscription. No API key, no per-token
billing.

It's an open-source take on the idea behind Cluely / Interview Coder, built on
documented OS capabilities.

---

## ⚠️ Intended use — read this

The "invisible to screen capture" behaviour uses the same OS APIs that password
managers and DRM video players use to keep sensitive windows out of screen
shares. That capability is **dual-use**.

Using it to deceive someone who hasn't consented — e.g. secretly reading AI
answers during a monitored job interview or a proctored exam — is very likely a
violation of that platform's rules and, depending on context, dishonest or
against the law. **That's on you.** This project is provided for legitimate uses
(private notes and teleprompting during your *own* presentations, accessibility,
research into how screen-capture exclusion works) and with no warranty. Don't be
a cheater.

---

## What makes it "undetectable"

| Layer | How | Reliability |
|---|---|---|
| **Screen-capture exclusion** | Electron `setContentProtection(true)` → macOS `NSWindowSharingNone` | Windows: excluded from all capture (solid). macOS: reliably hidden from Zoom/Teams/Meet screen-share and screenshots; **best-effort** against some ScreenCaptureKit recorders & QuickTime. Linux: not supported (overlay is visible). |
| **No focus theft** | Non-activating window shown with `showInactive()` | The app you're actually using stays foreground; overlay never appears in the app switcher. |
| **No Dock / taskbar entry** | `skipTaskbar`, macOS `app.dock.hide()` | Nothing to click on, nothing to see. |
| **Hotkey-driven** | Global shortcuts for every action | You never move the mouse to an invisible window (the classic tell). |
| **Survives full screen** | `setVisibleOnAllWorkspaces(..., { visibleOnFullScreenWorkspaces: true })` | Stays up over full-screen apps. |

> macOS is the primary target. Windows targets are configured but not yet built
> or tested. Linux is unsupported because content protection is a no-op there.

## Requirements

- **macOS**
- **[Claude Code](https://docs.claude.com/en/docs/claude-code) installed and logged in.** Ghostpane shells out to the `claude` CLI, which routes requests through your Pro/Max subscription.
  ```bash
  # install (see Anthropic docs for your platform), then:
  claude login
  ```
- **Screen Recording permission** for Ghostpane (needed so *it* can screenshot the question — its own window is still excluded from *others'* capture). Grant it in **System Settings → Privacy & Security → Screen Recording** the first time you use ⌘⏎.

## Install

1. Download the latest `Ghostpane-*.dmg` from the [Releases](../../releases) page.
2. Open the `.dmg` and drag Ghostpane to Applications.
3. The build is **unsigned**, so on first launch macOS Gatekeeper will block it.
   **Right-click the app → Open → Open** to run it anyway (only needed once).

## Hotkeys

| Action | Shortcut |
|---|---|
| Show / hide overlay | `⌘ \` |
| Screenshot behind overlay + ask | `⌘ ⏎` |
| Focus the prompt input (to type) | `⌘ ⇧ Space` |
| Scroll answer up / down | `⌘ ↑` / `⌘ ↓` |
| Toggle click-through | `⌘ ⇧ \` |
| Quit | `⌘ ⇧ Q` |

Type a question and press **Enter** for a text-only ask, or hit **⌘⏎** to
capture whatever's on screen behind the overlay and have Claude read it.

## Build from source

```bash
git clone <this repo>
cd ghostpane
npm install
npm run dev        # live-reload dev build
npm test           # unit tests (Vitest)
npm run dist       # build a .dmg into release/
```

See [`docs/SMOKE.md`](docs/SMOKE.md) for the manual verification checklist and
[`docs/superpowers/specs`](docs/superpowers/specs) for the design spec.

## How it works (architecture)

- **main process** (`src/main`) owns everything OS-native: the stealth window
  (`overlay-window.ts`), global hotkeys (`register-shortcuts.ts`), screen
  capture (`screenshot.ts`), and the `claude` CLI provider (`claude.ts`).
- **preload** (`src/preload`) exposes a minimal, typed `window.ghost` API over a
  `contextBridge` — the renderer never touches Node or Electron directly.
- **renderer** (`src/renderer`) is a small React app: a prompt box and a
  streaming, markdown-rendered answer panel.

The `claude` provider spawns `claude -p <prompt> --output-format stream-json
--verbose --include-partial-messages` and streams `text_delta` events straight
to the UI.

## License

MIT — see [LICENSE](LICENSE).
