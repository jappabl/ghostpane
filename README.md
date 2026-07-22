# Ghostpane

A translucent AI overlay that floats over your screen, answers questions from
what it sees, and is **excluded from screen recording and screen sharing** —
powered by *your own* Claude Pro/Max subscription. No API key, no per-token
billing.

It's an open-source take on the idea behind Cluely / Interview Coder, built on
documented OS capabilities.

---

## ⚠️ Intended use — read this first

The "invisible to screen capture" behaviour uses the same OS APIs that password
managers and DRM video players use to keep sensitive windows out of screen
shares. That capability is **dual-use**.

Using it to deceive someone who hasn't consented — e.g. secretly reading AI
answers during a monitored job interview or a proctored exam — is very likely a
violation of that platform's rules and, depending on context, dishonest or
against the law. **That's on you.** This project is provided for legitimate uses
(private notes and teleprompting during your *own* presentations, accessibility,
research into how screen-capture exclusion works) and with no warranty.

---

# Install guide (macOS) — read every step

> This is written so a first-timer can't get lost. It takes about 5 minutes.
> You only do steps 1–3 and 5–6 **once**.

## Step 0 — What you need

1. A **Mac** (Apple Silicon or Intel).
2. A **Claude Pro or Max subscription** (the $20+/mo plan at claude.ai). A free
   account will not work.
3. **Claude Code** installed and logged in on this Mac (steps 1–2 below). This is
   how Ghostpane talks to Claude using your subscription — it never asks you for
   an API key.

## Step 1 — Install Claude Code

Open the **Terminal** app (press `Cmd+Space`, type "Terminal", hit Return) and
paste this, then press Return:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

(Prefer Homebrew? `brew install --cask claude-code` works too. Don't use npm —
that method is deprecated.)

When it finishes, **quit and reopen Terminal** (so it picks up the new command),
then verify it worked:

```bash
claude --version
```

You should see a version number like `2.x.x`. If you instead see
`command not found`, close Terminal, open it again, and re-run the check. (Full
install docs: https://docs.claude.com/en/docs/claude-code )

## Step 2 — Log in to Claude with your subscription

In Terminal, run:

```bash
claude
```

The first time, it walks you through logging in — choose **"Claude account with
subscription"** (NOT an API key), and a browser window opens for you to sign in
to your Pro/Max account. Approve it, return to Terminal, then type `/exit` and
press Return to leave.

✅ **Test that it's really using your subscription** (optional but reassuring):

```bash
claude -p "say hi"
```

If it replies `hi` (or similar), you're done with setup. If it complains about
billing or an API key, run `claude` again and make sure you picked the
**subscription** login, not an API key.

## Step 3 — Figure out which Ghostpane file to download

You need to know if your Mac is **Apple Silicon** or **Intel**:

1. Click the **Apple menu** () at the top-left of your screen.
2. Click **About This Mac**.
3. Look at the chip/processor line:
   - If it says **"Chip: Apple M1 / M2 / M3 …"** → you have **Apple Silicon**.
   - If it says **"Processor: Intel …"** → you have **Intel**.

## Step 4 — Download and install Ghostpane

1. Go to the **[Releases page](../../releases/latest)**.
2. Under **Assets**, download the file that matches Step 3:
   - Apple Silicon → **`Ghostpane-<version>-arm64.dmg`**
   - Intel → **`Ghostpane-<version>.dmg`** (the one *without* `arm64`)
3. Open the downloaded `.dmg` (double-click it in Downloads). A window appears
   showing the **Ghostpane** app icon next to an **Applications** folder.
4. **Drag the Ghostpane icon onto the Applications folder.** That installs it.
5. You can now eject the `.dmg` (click the ⏏ next to it in Finder's sidebar).

## Step 5 — Open it the first time (get past the security warning)

Because this app isn't signed with a paid Apple certificate, macOS blocks it on
the first launch. This is expected — here's how to open it anyway:

1. Open your **Applications** folder (in Finder, press `Cmd+Shift+A`).
2. **Right-click** (or Control-click) **Ghostpane** → choose **Open**.
3. A dialog says *"macOS cannot verify the developer…"* — click the **Open**
   button in that dialog.

   - If you see **no Open button** (just "Move to Trash" / "Cancel", common on
     newer macOS): click **Cancel**, then go to **System Settings → Privacy &
     Security**, scroll down to the message *"Ghostpane was blocked…"*, and click
     **Open Anyway**. Then repeat the right-click → Open.

You only have to do this **once**. After that it opens normally.

## Step 6 — Grant Screen Recording permission

Ghostpane needs Screen Recording permission so it can **screenshot the thing you
ask about**. (Its *own* window still stays hidden from anyone *else's* screen
share — this permission is only about Ghostpane reading your screen.)

You'll be prompted the first time you use the screenshot hotkey. To do it now:

1. **System Settings → Privacy & Security → Screen Recording**.
2. Turn **Ghostpane** on (toggle it blue). If Ghostpane isn't listed yet, click
   **+**, choose Ghostpane from Applications, and add it.
3. macOS will ask you to **quit and reopen Ghostpane** — do that.

## Step 7 — Use it

When Ghostpane is running there is **no Dock icon and no window in the app
switcher** — that's intentional. You control it entirely with keyboard shortcuts:

| What you want | Keys | Notes |
|---|---|---|
| **Show / hide** the overlay | `⌘ \` | The backslash key. Start here. |
| **Type a question** | `⌘ ⇧ Space` | Puts your cursor in the text box. Type, press **Return** to send. |
| **Answer what's on screen** | `⌘ ⏎` | Takes a screenshot behind the overlay and asks Claude about it. |
| Scroll a long answer | `⌘ ↑` / `⌘ ↓` | |
| **Click-through** on/off | `⌘ ⇧ \` | When on, your clicks pass *through* the overlay to the app underneath. |
| **Open logs** | `⌘ ⇧ L` | Opens `~/Library/Logs/Ghostpane/` so you can see exactly what happened. |
| **Quit** Ghostpane | `⌘ ⇧ Q` | |

**Pick a model:** the dropdown in the bar chooses Default / Opus / Sonnet /
Haiku (saved between launches, passed to `claude --model`).

**Your first question, start to finish:**

1. Press **`⌘\`** — a small translucent bar appears near the top of your screen.
2. Press **`⌘⇧Space`** — your cursor lands in the box.
3. Type `what is the capital of France` and press **Return**.
4. The answer streams in and the window **grows to fit it**, then shrinks back on
   your next question.
5. To answer something already on your screen (e.g. a question in another app),
   just press **`⌘⏎`** instead — no typing needed.

That's it. Press `⌘\` to tuck it away whenever you want.

---

## What makes it "undetectable"

| Layer | How | Reliability |
|---|---|---|
| **Screen-capture exclusion** | Electron `setContentProtection(true)` → macOS `NSWindowSharingNone` | Reliably hidden from Zoom/Teams/Meet screen-share and screenshots; **best-effort** against some ScreenCaptureKit recorders & QuickTime. Windows (not yet shipped) would be airtight; Linux unsupported. |
| **No focus theft** | Non-activating window shown with `showInactive()` | The app you're actually using stays foreground; the overlay never appears in the app switcher. |
| **No Dock / taskbar entry** | `skipTaskbar`, macOS `app.dock.hide()` | Nothing to click on, nothing to see. |
| **Hotkey-driven** | Global shortcuts for every action | You never move the mouse to an invisible window (the classic tell). |

> macOS is the only shipped target today.

### Don't take the exclusion on faith — verify it
- **30-second manual test:** show the overlay (`⌘\`), start a QuickTime screen
  recording or a Zoom "Share Screen", and check the playback — the overlay you
  see isn't in the capture.
- **Rigorous automated A/B proof:** `npm run verify:capture` shows a marker
  window and captures the screen with content protection OFF → ON → OFF, printing
  a PASS/FAIL verdict and saving the images. See [docs/SMOKE.md](docs/SMOKE.md).

---

## Troubleshooting

**"I pressed `⌘\` and nothing happened."**
Make sure Ghostpane is actually running (you opened it from Applications). If
another app already uses `⌘\`, that shortcut may be taken — quit that app and
try again. There is deliberately no Dock icon, so "nothing visible" is normal
until you press `⌘\`.

**The answer area shows "Claude Code CLI not found."**
Ghostpane looks for `claude` in the usual install locations (Homebrew,
`/usr/local/bin`, `~/.local/bin`, etc.). If it still can't find it, redo
**Step 1**, then check the log (**⌘⇧L**) — it prints exactly where it looked.

**Something's wrong and I want to see what.**
Press **⌘⇧L** to open `~/Library/Logs/Ghostpane/ghostpane.log`. It records
startup, which `claude` binary was found, every shortcut, each ask, and the exact
CLI exit code + stderr.

**It says something about billing / API key instead of answering.**
You're logged into Claude Code with an API key instead of your subscription. In
Terminal run `claude`, and re-log in choosing the **subscription** option.

**`⌘⏎` says "Screen Recording permission needed" (or nothing appears).**
macOS is blocking the screen read. Ghostpane now auto-opens **System Settings →
Privacy & Security → Screen Recording** — enable **Ghostpane** in that list, then
**quit (`⌘⇧Q`) and reopen it**. This is required for the screenshot feature; typed
questions work without it. Note: because the app is unsigned, **after installing an
update you may have to re-enable it** (macOS sees the new build as modified — toggle
Ghostpane off and on, or remove it with the `–` button and re-add it). The log
(`⌘⇧L`) prints the exact permission status.

**The overlay shows up in my screen recording anyway.**
On macOS, exclusion is reliable for Zoom/Teams/Meet *screen sharing* and
screenshots, but **best-effort** for some ScreenCaptureKit-based recorders and
QuickTime. This is a documented macOS limitation, not a bug.

**How do I completely close it?**
Press `⌘⇧Q`. (Or, from Terminal: `pkill -f Ghostpane`.)

---

## Build from source

```bash
git clone https://github.com/jappabl/ghostpane
cd ghostpane
npm install
npm run dev        # live-reload dev build
npm test           # unit tests (Vitest)
npm run dist       # build .dmg files into release/
```

## How it works (architecture)

- **main process** (`src/main`) owns everything OS-native: the stealth window
  (`overlay-window.ts`), global hotkeys (`register-shortcuts.ts`), screen
  capture (`screenshot.ts`), the content-fit resize handler (`index.ts`), and the
  `claude` CLI provider (`claude.ts`, which also holds the overlay system prompt).
- **preload** (`src/preload`) exposes a minimal, typed `window.ghost` API over a
  `contextBridge` — the renderer never touches Node or Electron directly.
- **renderer** (`src/renderer`) is a small React app: a prompt box and a
  streaming, markdown-rendered answer panel that reports its height so the window
  fits the content.

## License

MIT — see [LICENSE](LICENSE).
