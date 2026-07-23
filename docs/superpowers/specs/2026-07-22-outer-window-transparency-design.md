# Outer Window Transparency Design

**Date:** 2026-07-22
**Status:** Approved in conversation; awaiting written-spec review

## Objective

Remove the faint full-window rectangle surrounding Ghostpane while leaving the command bar and answer card visibly distinct.

This is a narrow visual refinement. It does not change layout, dimensions, content, shortcuts, interaction, provider behavior, math rendering, or the established glass treatment inside the two primary containers.

## Chosen Approach

Use two complementary safeguards:

1. Make the native Electron window background explicitly transparent instead of relying only on the `transparent` flag.
2. Remove the broad external shadow shared by the command bar and answer panel, which currently overlaps into a window-sized haze.

The renderer root remains a layout wrapper only. It paints no background, border, filter, or shadow.

## Visual Treatment

The command bar and answer panel retain:

- Their `rgba(20, 20, 24, 0.62)` glass fill.
- Backdrop blur and saturation.
- Rounded corners.
- One-pixel translucent border.
- Subtle inset top highlight.

The shared `.glass` rule no longer paints the external `0 10px 40px rgba(0, 0, 0, 0.45)` shadow. This removes the surrounding dark/translucent field while preserving the containers themselves.

The command bar clips its glass effect to its rounded bounds. The answer panel already clips through `overflow: hidden`.

## Window and Renderer Transparency

`createOverlay` sets the `BrowserWindow` option `backgroundColor` to `#00000000` alongside `transparent: true` and `hasShadow: false`.

The renderer explicitly keeps `html`, `body`, `#root`, and `.root` transparent. None of these wrappers receives backdrop blur or a composited background.

## Compatibility

- Keep the frameless nonactivating macOS panel behavior.
- Keep content protection, always-on-top behavior, click-through, dynamic resizing, and screen-capture exclusion unchanged.
- Keep the current bar and panel spacing so the two surfaces remain visually separate.
- Do not remove or reduce the containers' own glass fill or border.
- Do not add native vibrancy, opacity animation, masks, or custom window shapes.

## Verification

- Add a focused unit assertion that the overlay window options include `transparent: true`, `backgroundColor: '#00000000'`, and `hasShadow: false` without constructing a real window.
- Run the full TypeScript tests and typecheck.
- Run the production build.
- Run the Impeccable mechanical detector on the changed UI targets.
- Rebuild and strictly verify the signed Apple Silicon app and DMG.
- Install the rebuilt app and confirm its version, signature, and process.
- Visually confirm that only the command bar and answer panel paint surfaces, with no faint rectangle spanning the transparent padding between or around them.

## Success Criteria

1. The full BrowserWindow bounds are visually transparent.
2. The command bar and answer panel remain legible glass containers.
3. No outer shadow or haze visually joins the two containers.
4. Existing layout, behavior, keyboard shortcuts, resizing, and capture protection remain unchanged.
