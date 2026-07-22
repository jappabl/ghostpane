# Ghostpane v0.1.0

First release. A translucent AI overlay that's **excluded from screen recording
and screen sharing**, powered by your own Claude Pro/Max subscription (no API
key — it shells out to the `claude` CLI you're logged into).

## Install (macOS)

1. Download `Ghostpane-0.1.0-arm64.dmg` (Apple Silicon) or `Ghostpane-0.1.0.dmg` (Intel).
2. Open it and drag **Ghostpane** to Applications.
3. The build is **unsigned** — first launch, **right-click the app → Open → Open**.
4. Make sure you have [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and have run `claude login`.
5. First `⌘⏎` will ask for **Screen Recording** permission (so it can screenshot the question — its own window stays hidden from *others'* capture).

## Hotkeys

| Action | Shortcut |
|---|---|
| Show / hide overlay | `⌘ \` |
| Screenshot + ask | `⌘ ⏎` |
| Focus prompt (type) | `⌘ ⇧ Space` |
| Scroll answer | `⌘ ↑` / `⌘ ↓` |
| Toggle click-through | `⌘ ⇧ \` |
| Quit | `⌘ ⇧ Q` |

## Please use it honestly

The screen-capture exclusion is dual-use OS tech (same as password managers).
Using it to deceive someone who hasn't consented — a monitored interview, a
proctored exam — is on you. See the README.

**Note:** on macOS the exclusion reliably hides the overlay from Zoom/Teams/Meet
screen-share and screenshots; it's best-effort against some ScreenCaptureKit
recorders and QuickTime. Windows/Linux builds are not yet shipped.
