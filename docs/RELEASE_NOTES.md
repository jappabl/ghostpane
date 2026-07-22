# Ghostpane v0.1.5

A translucent AI overlay that's **hidden from screen recording & screen
sharing**, powered by your own Claude Pro/Max subscription (no API key). It grows
to fit each answer and tucks away with a hotkey.

### New in v0.1.5
- **Now shows over full-screen apps.** The overlay is a macOS *panel* window
  (`NSWindowStyleMaskNonactivatingPanel`), so it floats over other apps'
  full-screen Spaces like Spotlight — a normal window can't do that. Combined with
  v0.1.4's follow-across-Spaces, it now stays with you everywhere.

### Earlier (v0.1.4)
- **Follows you across Spaces** — stays with you across desktop/Space switches
  (dock-hidden window keeps joining every Space; re-asserted on show).

### Earlier (v0.1.3)
- **Fixed: nothing happened on ⌘⏎.** Two bugs: (1) the screenshot-ask ran against
  a *hidden* window so you never saw the answer or error, and (2) the installed
  app couldn't find the `claude` CLI because a Finder-launched macOS app doesn't
  inherit your shell PATH (no Homebrew). Ghostpane now resolves `claude` from the
  usual install locations and always shows results.
- **Model picker** — choose Default / Opus / Sonnet / Haiku from the bar; the
  choice is saved and passed to `claude --model`.
- **Error logs** — everything is written to `~/Library/Logs/Ghostpane/ghostpane.log`
  (open it with **⌘⇧L**), and errors now show in the panel with the log path.

### Earlier (v0.1.2)
- **Redesigned UI** — a minimalist Cluely-style glass command bar ("Ask
  anything…" with a brand dot and a screenshot button) floating above a separate
  answer card, with backdrop blur, ⌘-key chips, and a slide-in animation.

### Earlier (v0.1.1)
- **Auto-resizing window** — starts as a small bar and grows to fit Claude's
  answer, then shrinks back (long answers scroll).
- **Overlay-tuned answers** — answer-first, no preamble, code in fenced blocks,
  short lines that fit the narrow window.

---

## 📥 Install (macOS) — do these in order

**You need:** a Mac, a **Claude Pro/Max subscription**, and **Claude Code**
installed + logged in (that's how this uses your subscription — no API key).

**1. Install Claude Code.** Open Terminal (`Cmd+Space`, type "Terminal", Return) and paste:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```
Quit + reopen Terminal, then check it worked: `claude --version`

**2. Log in with your subscription.** Run `claude`, choose **"Claude account with
subscription"** (NOT an API key), sign in via the browser, then type `/exit`.

**3. Pick your download.** Apple menu  → About This Mac → check the chip:
- **Apple M1/M2/M3…** → download **`Ghostpane-0.1.1-arm64.dmg`**
- **Intel** → download **`Ghostpane-0.1.1.dmg`** (no `arm64`)

**4. Install.** Open the `.dmg`, drag **Ghostpane** onto the **Applications** folder.

**5. First open (get past the security warning).** In Applications, **right-click
Ghostpane → Open → Open**. If there's no "Open" button, go to **System Settings →
Privacy & Security**, find *"Ghostpane was blocked"*, click **Open Anyway**, then
right-click → Open again. (One time only.)

**6. Screen Recording permission.** So it can screenshot what you ask about:
**System Settings → Privacy & Security → Screen Recording** → turn **Ghostpane**
on → quit & reopen it when prompted.

## ⌨️ Using it (there's no Dock icon — that's intentional)

| Action | Keys |
|---|---|
| Show / hide overlay | **`⌘ \`** ← start here |
| Type a question | `⌘ ⇧ Space`, then Return to send |
| Answer what's on screen | `⌘ ⏎` (screenshots behind the overlay) |
| Scroll answer | `⌘ ↑` / `⌘ ↓` |
| Click-through on/off | `⌘ ⇧ \` |
| Quit | `⌘ ⇧ Q` |

**First try:** press `⌘\` (a bar appears) → `⌘⇧Space` → type a question → Return.

Full guide + troubleshooting: see the [README](https://github.com/jappabl/ghostpane#install-guide-macos--read-every-step).

---

**Please use it honestly.** The capture-exclusion is dual-use OS tech (same as
password managers). Using it to deceive someone who hasn't consented — a monitored
interview, a proctored exam — is on you.

**Caveat:** on macOS the exclusion reliably hides the overlay from
Zoom/Teams/Meet screen-share and screenshots; it's best-effort against some
ScreenCaptureKit recorders and QuickTime. Windows/Linux not shipped yet.
