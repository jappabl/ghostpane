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
| 6 | Press ⌘⇧\ → clicks pass through the overlay to the app beneath (click-through on). Press again to turn off. | |
| 7 | With the overlay shown, type into an editor beneath it → keystrokes land in the editor (overlay did not steal focus). | |

Items 1, 2, 4, 5, 6, 7 must pass for release. Item 3 (QuickTime) is
documented as best-effort per macOS ScreenCaptureKit limitations.
