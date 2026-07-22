# Ghostpane v0.2.0

### New in v0.2.0
- **ChatGPT is now the default.** Sign in once with `codex login`; Claude remains
  available from the provider dropdown when you want it.
- **Hold ⌘⏎ for audio + screen context.** Ghostpane records microphone and
  system audio only while the shortcut is held, transcribes both locally, deletes
  the raw recordings, captures a fresh screenshot, and asks the selected provider.
  A quick tap keeps the original screenshot-only behavior.
- **Hardened desktop boundary.** Renderer navigation, external links, IPC payloads,
  and temporary screenshot ownership are now validated and cleaned up.
- **Reliable GitHub DMGs.** Releases now validate both test suites, build a
  universal native helper, fail closed without the stable signing identity, and
  verify both Intel and Apple Silicon artifacts before uploading either one.

Held audio requires macOS 14+ and Accessibility, Microphone, Screen Recording,
and Speech Recognition permissions. Downloads are still ordinary `.dmg` files.

---

# Ghostpane v0.1.12

### New in v0.1.12
- **Live status while it works.** Press ⌘⏎ and you now see the phases — "📸 Taking
  screenshot…" → "📸 Reading your screen…" → the streamed answer (with animated
  dots), instead of staring at a frozen bar. Typed questions show "💭 Thinking…".

---

# Ghostpane v0.1.11

### New in v0.1.11
- **First ⌘⏎ after launch works immediately.** The screen-capture pipeline is now
  warmed up at startup, so you no longer hit a cold-start "capture failed" on the
  very first screenshot.

---

# Ghostpane v0.1.10

### New in v0.1.10
- **Mashing ⌘⏎ no longer breaks it.** Rapid presses used to fire overlapping
  screen captures (and spawn a dozen Claude processes at once), causing random
  "Failed to get sources" errors. Captures are now serialized — one at a time.
- **Transient capture failures auto-retry.** The occasional first-capture-after-
  launch hiccup now retries instead of erroring.
- **Honest errors.** A capture failure while permission is *granted* no longer
  wrongly claims "permission needed" or re-opens System Settings.

---

# Ghostpane v0.1.9

### New in v0.1.9 — Screen Recording permission finally sticks
The real reason `⌘⏎` kept saying "no access" no matter how many times you granted
it: the app was **unsigned**, so every update changed its identity and macOS wiped
the Screen Recording grant. Ghostpane is now **code-signed with a stable identity**,
so once you grant it, the grant **survives updates**.

**One-time setup (do this once):**
1. Move **Ghostpane** to your **Applications** folder and open it from there.
2. Press `⌘⏎` — it opens System Settings → Privacy & Security → Screen Recording.
3. Turn **Ghostpane** on.
4. **Quit (`⌘⇧Q`) and reopen.** Done — `⌘⏎` now works and stays working.

**If you see "Ghostpane is damaged and can't be opened"** — it isn't damaged.
macOS shows that for any non-notarized downloaded app. Fix it once with:
```bash
xattr -cr /Applications/Ghostpane.app
```
then open it normally. (The permanent cure is Apple notarization, which needs a
paid Apple Developer account.)

---

# Ghostpane v0.1.8

### New in v0.1.8
- **Drag it around** — grab the bar (empty space or the dot) to move the overlay
  anywhere on screen. Input, model picker, and buttons stay clickable.
- **Input clears after you send** — hit Enter and the box empties, ready for the
  next question.
- **Permission diagnosis** — if you granted Screen Recording but it still says no
  access, you're almost certainly running Ghostpane from the disk image / Downloads
  (macOS "App Translocation"), so the grant doesn't stick. **Move Ghostpane to your
  Applications folder and reopen it.** The log (`⌘⇧L`) now prints the exact app
  path and flags translocation.

---

# Ghostpane v0.1.7

### New in v0.1.7
- **Screenshot (⌘⏎) now tells you what's wrong.** If macOS hasn't granted Screen
  Recording permission, `⌘⏎` was failing silently with a cryptic error. Now it
  shows clear steps **and auto-opens** System Settings → Privacy & Security →
  Screen Recording. Enable **Ghostpane**, then quit & reopen (`⌘⇧Q`). The exact
  permission status is written to the log (`⌘⇧L`).
- **Heads-up:** because the app is unsigned, after each update macOS may make you
  re-enable Screen Recording (it sees the new build as "modified").

---

# Ghostpane v0.1.6

A translucent AI overlay that's **hidden from screen recording & screen
sharing**, powered by your own Claude Pro/Max subscription (no API key). It grows
to fit each answer and tucks away with a hotkey.

### New in v0.1.6
- **Actually shows over full-screen apps now.** v0.1.5 made it a panel window but
  the "visible above full-screen" flag was passed under the wrong key
  (`visibleOnFullScreenWorkspaces` instead of `visibleOnFullScreen`), so it was
  never set. Fixed — panel window + the correct flag = it floats over full-screen
  apps like Spotlight.

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
