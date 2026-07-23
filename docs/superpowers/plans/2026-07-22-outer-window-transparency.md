# Outer Window Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the faint full-window rectangle so only Ghostpane's command bar and answer panel paint visible surfaces.

**Architecture:** Extract the native surface-related BrowserWindow options into a pure typed module so transparency is unit-testable without Electron. Make the native and renderer roots explicitly clear, remove only the shared external shadow, and clip the command bar's retained glass treatment to its rounded boundary.

**Tech Stack:** Electron 33 BrowserWindow, React renderer CSS, TypeScript, Vitest, Electron Builder.

## Global Constraints

- Preserve the command bar and answer panel glass fill, blur, saturation, border, radius, and inset top highlight.
- Preserve layout, spacing, dimensions, content, shortcuts, interaction, resizing, click-through, provider behavior, math rendering, and capture protection.
- Do not add vibrancy, opacity animation, masks, custom window shapes, or new dependencies.
- Keep the renderer wrappers non-painting and the two primary containers visually separate.

---

### Task 1: Isolate the two painted overlay surfaces

**Files:**
- Create: `src/main/overlay-options.ts`
- Modify: `src/main/overlay-window.ts`
- Modify: `src/renderer/styles.css`
- Create: `tests/overlay-appearance.test.ts`

**Interfaces:**
- Produces: `OVERLAY_SURFACE_OPTIONS`, a typed object containing `transparent: true`, `backgroundColor: '#00000000'`, and `hasShadow: false`.
- `createOverlay` consumes `OVERLAY_SURFACE_OPTIONS` through object spread.

- [ ] **Step 1: Write the failing appearance contract tests**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OVERLAY_SURFACE_OPTIONS } from '../src/main/overlay-options'

const styles = readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8')

describe('overlay surface isolation', () => {
  it('uses an explicitly transparent native window without a native shadow', () => {
    expect(OVERLAY_SURFACE_OPTIONS).toEqual({
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false
    })
  })

  it('keeps renderer wrappers clear and removes the broad shared shadow', () => {
    expect(styles).toMatch(/html, body, #root\s*\{[^}]*background:\s*transparent/s)
    expect(styles).toMatch(/\.root\s*\{[^}]*background:\s*transparent/s)
    expect(styles).not.toContain('0 10px 40px rgba(0, 0, 0, 0.45)')
    expect(styles).toMatch(/\.glass\s*\{[^}]*box-shadow:\s*inset 0 1px 0 rgba\(255, 255, 255, 0\.06\)/s)
    expect(styles).toMatch(/\.bar\s*\{[^}]*overflow:\s*hidden/s)
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/overlay-appearance.test.ts`

Expected: FAIL because `src/main/overlay-options.ts` does not exist.

- [ ] **Step 3: Add the typed native transparency options**

```ts
import type { BrowserWindowConstructorOptions } from 'electron'

export const OVERLAY_SURFACE_OPTIONS = {
  transparent: true,
  backgroundColor: '#00000000',
  hasShadow: false
} satisfies Pick<
  BrowserWindowConstructorOptions,
  'transparent' | 'backgroundColor' | 'hasShadow'
>
```

Import `OVERLAY_SURFACE_OPTIONS` in `overlay-window.ts`, spread it into the `BrowserWindow` constructor after `frame: false`, and remove the three duplicated inline surface options.

- [ ] **Step 4: Make wrappers clear and contain the retained glass surfaces**

Use these exact CSS declarations:

```css
html, body, #root { background: transparent; }
html, body {
  margin: 0; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.root {
  display: flex; flex-direction: column; gap: 8px; padding: 10px 14px 16px;
  background: transparent;
}
```

Replace the shared shadow with the retained inset highlight only:

```css
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

Add `overflow: hidden` to `.bar`. Do not modify `.glass` background, blur, saturation, border, or color; do not modify `.panel`.

- [ ] **Step 5: Run focused and full automated checks**

Run: `npx vitest run tests/overlay-appearance.test.ts`

Expected: both tests PASS.

Run: `npm test`

Expected: all TypeScript tests PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Run the required UI detector**

Run: `node /Users/hlin/.codex/plugins/cache/impeccable/impeccable/4.0.1/skills/impeccable/scripts/detect.mjs --json src/renderer/styles.css src/main/overlay-window.ts src/main/overlay-options.ts`

Expected: no blocking design findings related to the changed targets.

- [ ] **Step 7: Commit the isolated surfaces**

```bash
git add src/main/overlay-options.ts src/main/overlay-window.ts src/renderer/styles.css tests/overlay-appearance.test.ts
git commit -m "fix: remove outer overlay haze"
```

### Task 2: Build, release, and install v0.2.2

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/RELEASE_NOTES.md`
- Generate: `release/Ghostpane-0.2.2-arm64.dmg`
- Generate: `release/Ghostpane-0.2.2.dmg`

**Interfaces:**
- Produces: signed v0.2.2 Apple Silicon and Intel DMGs and an updated `/Applications/Ghostpane.app`.

- [ ] **Step 1: Bump version and document the visual fix**

Run: `npm version 0.2.2 --no-git-tag-version`

Expected: `package.json` and `package-lock.json` both report `0.2.2`.

Add this release section above v0.2.1:

```markdown
# Ghostpane v0.2.2

### New in v0.2.2
- **Cleaner floating surfaces.** The faint rectangle around the overlay is gone;
  only the command bar and answer panel remain visible.

---
```

- [ ] **Step 2: Run the complete verification matrix**

Run: `npm test`

Expected: all TypeScript tests PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run native:test`

Expected: all Swift tests PASS.

- [ ] **Step 3: Build both signed DMGs with signing required**

Run: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer GHOSTPANE_REQUIRE_SIGNING=1 npm run dist`

Expected: both packaged apps are signed with `Ghostpane Local Signing`; `release/Ghostpane-0.2.2-arm64.dmg` and `release/Ghostpane-0.2.2.dmg` exist.

- [ ] **Step 4: Verify both release artifacts**

```bash
scripts/verify-release.sh release/mac-arm64/Ghostpane.app release/Ghostpane-0.2.2-arm64.dmg arm64
scripts/verify-release.sh release/mac/Ghostpane.app release/Ghostpane-0.2.2.dmg x64
```

Expected: both commands report verified signed apps, correct Electron architecture, and universal native helpers.

- [ ] **Step 5: Install and verify v0.2.2**

Quit the exact running Ghostpane process, move `/Applications/Ghostpane.app` to a timestamped recoverable Trash backup, copy `release/mac-arm64/Ghostpane.app` to `/Applications/Ghostpane.app`, clear quarantine only on that path, and launch it.

```bash
defaults read /Applications/Ghostpane.app/Contents/Info.plist CFBundleShortVersionString
codesign --verify --deep --strict /Applications/Ghostpane.app
pgrep -fl '/Applications/Ghostpane.app/Contents/MacOS/Ghostpane'
```

Expected: version `0.2.2`, strict signature verification succeeds, and the installed app process is running.

- [ ] **Step 6: Commit, push, tag, and publish**

```bash
git add package.json package-lock.json docs/RELEASE_NOTES.md
git commit -m "release: prepare v0.2.2"
git push origin codex/audio-chatgpt-hardening
git tag -a v0.2.2 -m "Ghostpane v0.2.2"
git push origin v0.2.2
```

Create the GitHub v0.2.2 release with both verified DMGs and `docs/RELEASE_NOTES.md`, then confirm both assets have content type `application/x-apple-diskimage` and state `uploaded`.
