<div align="center">

# Ghostpane

**A translucent, screen-share-hidden AI overlay powered by your ChatGPT or Claude subscription.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/jappabl/ghostpane?color=8b5cf6)](https://github.com/jappabl/ghostpane/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#requirements)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-2f3241.svg)](https://electronjs.org)

![Ghostpane floating over a screen-shared Zoom call, answering a coding question](docs/assets/hero.png)

</div>

Ghostpane floats a small glass bar over everything you do. Ask a typed question, tap one shortcut for a screenshot, or hold that shortcut to add microphone and system-audio context. ChatGPT is the default provider and Claude remains one click away. The window is excluded from screen recording and screen sharing, so it does not appear in Zoom, Teams, Meet, QuickTime, or OBS.

It's an open take on the idea behind Cluely and Interview Coder, built entirely on documented macOS APIs.

## Please use it responsibly

The screen-capture exclusion is the same OS feature password managers and DRM video players use to keep sensitive windows out of screen shares. There are honest reasons to want it: private notes during your own presentations, teleprompting, accessibility, or just learning how the exclusion works.

Using it to deceive someone who has not agreed to it, like a monitored interview or a proctored exam, is dishonest, probably against that platform's rules, and entirely on you. Don't be a cheater.

## Features

- Excluded from screen shares and recordings on macOS (Zoom, Teams, Meet, screenshots; best-effort against some ScreenCaptureKit recorders and QuickTime).
- Tap `⌘⏎` for a screenshot answer; hold it to record microphone and system audio, transcribe both locally, and answer using a fresh screenshot.
- Uses your ChatGPT subscription through the Codex CLI by default. Claude Code remains an optional provider. No API key.
- Audio recording is strictly press-and-hold. Releasing the keys stops capture; raw temporary audio is deleted after local transcription.
- Streams answers token by token and grows the window to fit, then shrinks back.
- Never steals focus, has no Dock or app-switcher entry, and follows you across Spaces and over full-screen apps.
- Driven entirely by global hotkeys, so you never move the mouse to a window nobody else can see.
- Switch provider and model from two dropdowns in the bar.

## Requirements

- A Mac (Apple Silicon or Intel). Held system-audio capture requires macOS 14 or newer.
- A ChatGPT subscription authenticated with the [Codex CLI](https://developers.openai.com/codex/cli), or an optional Claude subscription authenticated with Claude Code.

## Quick start

**1. Sign in to ChatGPT through Codex.** In Terminal:

```bash
npm install -g @openai/codex
codex login
```

If you already have the ChatGPT macOS app, Ghostpane can use its bundled Codex executable. Run `codex login` once so subscription authentication is ready. To use Claude instead, install Claude Code, run `claude`, then choose Claude from the provider dropdown.

**2. Download Ghostpane.** Grab the right file from the [latest release](https://github.com/jappabl/ghostpane/releases/latest):

- Apple Silicon (M1/M2/M3): `Ghostpane-<version>-arm64.dmg`
- Intel: `Ghostpane-<version>.dmg`

(Not sure which? Apple menu > About This Mac > look at the chip.)

**3. Install it.** Open the `.dmg`, drag Ghostpane into Applications.

**4. Clear the download flag if macOS calls the app "damaged."** The app inside the DMG is signed with Ghostpane's stable self-signed identity, not an Apple Developer ID. Run this once if Gatekeeper blocks it:

```bash
xattr -cr /Applications/Ghostpane.app
```

**5. Grant permissions.** Open Ghostpane and press `⌘⏎` once. For screenshots, enable Screen Recording. For held audio, also enable Accessibility, Microphone, and Speech Recognition. Quit (`⌘⇧Q`) and reopen after changing them. Ghostpane records only while `⌘⏎` remains held.

That's it. Press `⌘\` to summon the bar and start asking.

## Keyboard

There is no Dock icon by design. Everything runs through global shortcuts:

| Action | Shortcut |
| --- | --- |
| Show / hide the overlay | `⌘ \` |
| Type a question | `⌘ ⇧ Space`, then Return |
| Answer what's on screen | Tap `⌘ ⏎` |
| Add microphone + system audio | Hold `⌘ ⏎`, release to submit |
| Scroll a long answer | `⌘ ↑` / `⌘ ↓` |
| Click-through on/off | `⌘ ⇧ \` |
| Open the logs | `⌘ ⇧ L` |
| Quit | `⌘ ⇧ Q` |

Pick ChatGPT or Claude and a model from the dropdowns. Both choices are saved.

## Verify the exclusion yourself

You do not have to take the "invisible" claim on faith.

- **The 30-second test:** show the overlay, start a QuickTime recording or a Zoom "Share Screen", and play it back. The overlay you see is not in the capture.
- **The rigorous test:** `npm run verify:capture` shows a marker window and captures the screen with content protection off, then on, then off, printing a pass/fail verdict. See [docs/SMOKE.md](docs/SMOKE.md).

## How it works

The magic is one OS capability plus some overlay hygiene:

- **Screen-capture exclusion.** `BrowserWindow.setContentProtection(true)` sets the window's macOS `NSWindowSharingType` to `none`, which drops it from the capture pipeline that Zoom, Teams, and OBS read.
- **Panel window.** The overlay is created as a macOS panel (`NSWindowStyleMaskNonactivatingPanel`) so it can float over other apps' full-screen Spaces, like Spotlight, without stealing focus.
- **Subscription auth.** The default provider runs `codex exec` with an ephemeral, read-only session; the optional Claude provider runs `claude -p`. Both use the subscription login already stored by their official CLI.
- **Local audio context.** A bundled universal Swift helper owns the global hold gesture, captures microphone and system audio with Apple frameworks, transcribes on-device, deletes the recordings, then passes only labeled transcripts and a fresh screenshot to the selected provider.

The code splits cleanly: the Electron main process owns the window, provider routing, screenshots, and a versioned native-helper bridge; a preload script exposes a small typed API; the renderer only draws.

<details>
<summary><b>Troubleshooting</b></summary>

**"Ghostpane is damaged and can't be opened."** It isn't. macOS shows this for any non-notarized download. Run `xattr -cr /Applications/Ghostpane.app`, then open it.

**"Codex CLI not found" or "ChatGPT is not signed in."** Run `codex login`, then reopen Ghostpane. You can also switch to Claude from the provider dropdown.

**Holding `⌘⏎` does not record.** Audio needs macOS 14+, plus Accessibility, Microphone, Screen Recording, and Speech Recognition access. Enable Ghostpane in all four Privacy & Security panes, then quit and reopen it.

**`⌘⏎` says it needs Screen Recording permission, even after I granted it.** This usually means you are running the app from the disk image or Downloads (macOS "App Translocation"), so the grant does not stick. Move Ghostpane into Applications and open it from there.

**Something is off and I want to see why.** Press `⌘⇧L` to open `~/Library/Logs/Ghostpane/ghostpane.log`. It records startup, provider CLI resolution, helper permissions, shortcuts, asks, and CLI exit codes.

**It shows up in my recording anyway.** On macOS the exclusion is reliable for Zoom/Teams/Meet sharing and for screenshots, but best-effort against some ScreenCaptureKit recorders and QuickTime. That is a documented macOS limit.

</details>

## Build from source

```bash
git clone https://github.com/jappabl/ghostpane
cd ghostpane
npm install
npm run dev     # live-reload dev build
npm test        # unit tests
npm run dist    # build the universal helper and both .dmg files into release/
```

The design spec and implementation plan live in [docs/superpowers](docs/superpowers).

## A note on signing

Ghostpane is signed with a stable self-signed certificate, not an Apple Developer ID. The release workflow fails rather than upload an unsigned app and verifies both app architectures plus the universal helper. The stable identity helps macOS retain permissions across updates, but Gatekeeper may still require the one-time `xattr` step. Developer ID signing and notarization would remove that friction and requires a paid Apple Developer account.

## License

[MIT](LICENSE)
