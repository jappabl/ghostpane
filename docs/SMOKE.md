# Ghostpane smoke test (macOS)

Run: `npm run dev` (or launch the installed `.dmg` build). Ensure `claude login`
has been run first.

| # | Check | Pass? |
|---|-------|-------|
| 1 | Overlay is visible to you; NOT in the Dock; NOT in Cmd+Tab. | |
| 2 | Start a Zoom "Share Screen" (or Google Meet / Teams) → the overlay is **absent** in the shared view while you still see it. | |
| 3 | Start a QuickTime "New Screen Recording" → overlay absent in the recording (best-effort on macOS; note the result). | |
| 4 | Type a question, press Enter → a streamed Claude answer appears token-by-token. | |
| 5 | Press ⌘⏎ over a visible on-screen question → the screenshot is answered. | |
| 6 | Press ⌘⇧\ → clicks pass through the overlay to the app beneath. Press again to turn off. | |
| 7 | With the overlay shown, type into an editor beneath it → keystrokes land in the editor (overlay did not steal focus). | |
| 8 | The window grows to fit a long answer, then shrinks back on the next question. | |

Items 1, 2, 4, 5, 6, 7, 8 must pass for release. Item 3 (QuickTime) is
best-effort per macOS ScreenCaptureKit limitations.

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
