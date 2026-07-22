# Ghostpane smoke test (macOS)

Run: `npm run dev` (or launch the installed `.dmg` build). Ensure `codex login`
has been run first. Held audio requires macOS 14 or newer.

| # | Check | Pass? |
|---|-------|-------|
| 1 | Overlay is visible to you; NOT in the Dock; NOT in Cmd+Tab. | |
| 2 | Start a Zoom "Share Screen" (or Google Meet / Teams) → the overlay is **absent** in the shared view while you still see it. | |
| 3 | Start a QuickTime "New Screen Recording" → overlay absent in the recording (best-effort on macOS; note the result). | |
| 4 | With ChatGPT selected, type a question and press Enter → an answer appears. Switch to Claude and repeat if Claude is configured. | |
| 5 | Tap ⌘⏎ over a visible on-screen question → screenshot-only answer; no audio recording indicator. | |
| 6 | Hold ⌘⏎ while speaking with no system audio → red recording indicator, microphone transcript context, fresh screenshot answer. | |
| 7 | Hold ⌘⏎ while system audio plays without speaking → system transcript context and answer. | |
| 8 | Hold ⌘⏎ while speaking over system audio → both sources are labeled separately. | |
| 9 | With Accessibility granted, deny Microphone or Speech Recognition → tap still screenshots and hold gives an actionable permission error. | |
| 10 | Deny Accessibility → the fallback shortcut still screenshots and opens permission setup on first use. | |
| 11 | After a completed, cancelled, and failed hold, the `ghostpane-audio/` directory in the system temporary directory is empty. | |
| 12 | Press ⌘⇧\ → clicks pass through the overlay to the app beneath. Press again to turn off. | |
| 13 | With the overlay shown, type into an editor beneath it → keystrokes land in the editor (overlay did not steal focus). | |
| 14 | The window grows to fit a long answer, then shrinks back on the next question. | |

All checks except item 3 must pass for release. Item 3 (QuickTime) is best-effort
per macOS ScreenCaptureKit limitations.

---

## Verifying the screen-capture exclusion (the core claim)

You do NOT have to take the exclusion on faith. Two ways to prove it:

### A. 30-second manual test (recommended, real-world)
1. Launch Ghostpane and press `⌘\` so the overlay is visible.
2. Open **QuickTime Player → File → New Screen Recording** (or start a Zoom
   "Share Screen").
3. Record a few seconds, stop, and play it back.
4. **The overlay you can see on your screen is not in the recording** — the pixels
   behind it are. (Zoom/Teams/Meet sharing is the most reliable; QuickTime is
   best-effort per macOS.)

### B. Automated A/B proof (rigorous, gives numbers)
```bash
npm run verify:capture
```
This shows a magenta MARKER window and captures the screen through the same
ScreenCaptureKit path recorders use, with content protection OFF → ON → OFF. It
prints, and saves images to `verify-out/`:

```
OFF  -> marker present: true   rgb(~230, ~30, ~150)   ← captured normally
ON   -> marker present: false  rgb(desktop behind)    ← EXCLUDED by protection
OFF  -> marker present: true   ...                    ← reversible
✅ PASS
```

**First run note:** macOS adds "Electron" to *System Settings → Privacy &
Security → Screen Recording* (initially off) and captures come back blank
(`INCONCLUSIVE`). Toggle "Electron" on, then run `npm run verify:capture` again
for the real PASS. (The permission is only for *this test's* capturer; the real
app's window is excluded from *others'* capture regardless.)
