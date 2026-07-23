# Separate Audio Hotkey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `Command+Return` screenshot-only and require holding `Command+Shift+Return` for microphone, system-audio, transcription, and fresh-screen context.

**Architecture:** Electron permanently owns the screenshot shortcut and owns a temporary audio permission/setup shortcut only while the native helper lacks Accessibility access. The Swift event tap exclusively suppresses the audio chord, feeds the existing 350 ms hold state machine, and discards short audio presses without sending a screenshot event.

**Tech Stack:** Electron 33 global shortcuts, TypeScript/Vitest, Swift 6/XCTest, macOS `CGEventTap`, existing native JSONL helper.

## Global Constraints

- `Command+Return` always performs a screenshot-only ask and never starts audio capture.
- `Command+Shift+Return` is audio-only and submits only after a 350 ms hold.
- Releasing Command, Shift, or Return ends the active hold without leaking Return to the foreground app.
- The audio fallback requests permission/setup but never submits a screenshot.
- Keep the existing protocol's `tap` event parseable for mixed-version compatibility, but ignore it in Electron.
- Do not add configurable shortcuts or change unrelated shortcut mappings.

---

### Task 1: Match and suppress only the native audio chord

**Files:**
- Modify: `native/Sources/GhostpaneNativeCore/GlobalHotkeyMonitor.swift`
- Test: `native/Tests/GhostpaneNativeCoreTests/GlobalHotkeyMonitorTests.swift`

**Interfaces:**
- Produces: `isAudioHotkey(keyCode:commandPressed:shiftPressed:controlPressed:optionPressed:isRepeat:) -> Bool`
- Produces: `shouldFinishAudioHotkeyForModifierChange(commandPressed:shiftPressed:pressActive:) -> Bool`
- Preserves: `shouldFinishCommandReturn(keyCode:pressActive:)` and `shouldSuppressActiveReturnKeyDown(keyCode:pressActive:)` semantics for active Return cleanup.

- [ ] **Step 1: Replace the matcher tests with failing audio-chord cases**

```swift
func testMatchesOnlyNonRepeatingCommandShiftReturn() {
    XCTAssertTrue(isAudioHotkey(
        keyCode: 36, commandPressed: true, shiftPressed: true,
        controlPressed: false, optionPressed: false, isRepeat: false
    ))
    XCTAssertFalse(isAudioHotkey(
        keyCode: 36, commandPressed: true, shiftPressed: false,
        controlPressed: false, optionPressed: false, isRepeat: false
    ))
    XCTAssertFalse(isAudioHotkey(
        keyCode: 36, commandPressed: true, shiftPressed: true,
        controlPressed: true, optionPressed: false, isRepeat: false
    ))
    XCTAssertFalse(isAudioHotkey(
        keyCode: 36, commandPressed: true, shiftPressed: true,
        controlPressed: false, optionPressed: true, isRepeat: false
    ))
    XCTAssertFalse(isAudioHotkey(
        keyCode: 36, commandPressed: true, shiftPressed: true,
        controlPressed: false, optionPressed: false, isRepeat: true
    ))
}

func testActivePressFinishesWhenEitherRequiredModifierIsReleased() {
    XCTAssertFalse(shouldFinishAudioHotkeyForModifierChange(
        commandPressed: true, shiftPressed: true, pressActive: true
    ))
    XCTAssertTrue(shouldFinishAudioHotkeyForModifierChange(
        commandPressed: false, shiftPressed: true, pressActive: true
    ))
    XCTAssertTrue(shouldFinishAudioHotkeyForModifierChange(
        commandPressed: true, shiftPressed: false, pressActive: true
    ))
    XCTAssertFalse(shouldFinishAudioHotkeyForModifierChange(
        commandPressed: false, shiftPressed: false, pressActive: false
    ))
}
```

- [ ] **Step 2: Run the focused Swift tests and verify they fail**

Run: `swift test --disable-sandbox --package-path native --filter GlobalHotkeyMonitorTests`

Expected: FAIL because `isAudioHotkey` and `shouldFinishAudioHotkeyForModifierChange` do not exist.

- [ ] **Step 3: Implement exact modifier matching and modifier-release completion**

```swift
public func isAudioHotkey(
    keyCode: Int64,
    commandPressed: Bool,
    shiftPressed: Bool,
    controlPressed: Bool,
    optionPressed: Bool,
    isRepeat: Bool
) -> Bool {
    keyCode == 36 && commandPressed && shiftPressed &&
        !controlPressed && !optionPressed && !isRepeat
}

public func shouldFinishAudioHotkeyForModifierChange(
    commandPressed: Bool,
    shiftPressed: Bool,
    pressActive: Bool
) -> Bool {
    pressActive && (!commandPressed || !shiftPressed)
}
```

In `handle(type:event:)`, read Command, Shift, Control, and Option flags; call the modifier-release helper for `.flagsChanged`; and replace `isCommandReturn` with `isAudioHotkey`. Keep active Return autorepeats and the eventual Return key-up suppressed. Because a non-active Command+Return no longer matches, it passes through to Electron.

- [ ] **Step 4: Run the focused and full Swift test suites**

Run: `swift test --disable-sandbox --package-path native --filter GlobalHotkeyMonitorTests`

Expected: PASS.

Run: `npm run native:test`

Expected: all Swift tests PASS.

- [ ] **Step 5: Commit the native matcher**

```bash
git add native/Sources/GhostpaneNativeCore/GlobalHotkeyMonitor.swift native/Tests/GhostpaneNativeCoreTests/GlobalHotkeyMonitorTests.swift
git commit -m "feat: move held audio to command shift return"
```

### Task 2: Discard short audio presses in the helper

**Files:**
- Modify: `native/Sources/GhostpaneHelper/main.swift`
- Modify: `native/Tests/GhostpaneNativeCoreTests/HotkeyStateMachineTests.swift`

**Interfaces:**
- Consumes: existing internal `HotkeyAction.tap` emitted for a sub-350 ms press.
- Produces: short presses call `controller.tap()` to discard buffered audio and emit no `HelperEvent.tap`.

- [ ] **Step 1: Tighten the state-machine test name and expectation**

```swift
func testShortAudioPressEmitsInternalTapForCleanupOnly() {
    var events: [HotkeyAction] = []
    let state = HotkeyStateMachine(threshold: .milliseconds(350)) { events.append($0) }

    state.keyDown(at: .zero)
    state.keyUp(at: .milliseconds(120))

    XCTAssertEqual(events, [.pressBegan, .tap])
}
```

- [ ] **Step 2: Remove the screenshot protocol emission from the helper's short-press branch**

```swift
case .tap:
    if ignoringCurrentPress {
        ignoringCurrentPress = false
        return
    }
    let shouldCancelAudio = audioReadyForPress
    audioReadyForPress = false
    if shouldCancelAudio {
        Task { await controller.tap() }
    }
```

Also change the monitor startup error and permission messages to name `Command+Shift+Return`, while continuing to describe `Command+Return` as screenshot-only.

- [ ] **Step 3: Run all Swift tests**

Run: `npm run native:test`

Expected: all Swift tests PASS and no protocol snapshot changes.

- [ ] **Step 4: Commit helper behavior**

```bash
git add native/Sources/GhostpaneHelper/main.swift native/Tests/GhostpaneNativeCoreTests/HotkeyStateMachineTests.swift
git commit -m "fix: discard short audio shortcut presses"
```

### Task 3: Give Electron permanent screenshot ownership and conditional audio setup ownership

**Files:**
- Modify: `src/shared/shortcuts.ts`
- Modify: `src/main/register-shortcuts.ts`
- Modify: `src/main/index.ts`
- Test: `tests/register-shortcuts.test.ts`

**Interfaces:**
- Produces: `AUDIO_SHORTCUT = 'CommandOrControl+Shift+Return'`.
- Produces: `syncAudioSetupShortcut(canOwnHotkey, onSetup, deps) -> boolean`.
- Consumes: Electron `register`, `unregister`, and `isRegistered` functions.

- [ ] **Step 1: Write failing registration and ownership tests**

```ts
import { AUDIO_SHORTCUT, DEFAULT_SHORTCUTS } from '../src/shared/shortcuts'
import { registerShortcuts, syncAudioSetupShortcut } from '../src/main/register-shortcuts'

it('always registers screenshot as a default shortcut', () => {
  const accelerators: string[] = []
  registerShortcuts(() => {}, {
    register: (accelerator) => { accelerators.push(accelerator); return true }
  })
  expect(accelerators).toContain(DEFAULT_SHORTCUTS['ask-screenshot'])
  expect(AUDIO_SHORTCUT).toBe('CommandOrControl+Shift+Return')
})

it('registers audio setup only while the helper cannot own the chord', () => {
  const registered = new Set<string>()
  const onSetup = vi.fn()
  const deps = {
    register: vi.fn((accelerator: string, callback: () => void) => {
      registered.add(accelerator); callback(); return true
    }),
    unregister: vi.fn((accelerator: string) => registered.delete(accelerator)),
    isRegistered: (accelerator: string) => registered.has(accelerator)
  }
  expect(syncAudioSetupShortcut(false, onSetup, deps)).toBe(true)
  expect(onSetup).toHaveBeenCalledOnce()
  syncAudioSetupShortcut(true, onSetup, deps)
  expect(deps.unregister).toHaveBeenCalledWith(AUDIO_SHORTCUT)
})
```

Remove the obsolete test that omits screenshot ownership.

- [ ] **Step 2: Run the registration tests and verify they fail**

Run: `npx vitest run tests/register-shortcuts.test.ts`

Expected: FAIL because `AUDIO_SHORTCUT` and `syncAudioSetupShortcut` do not exist.

- [ ] **Step 3: Implement the shared audio accelerator and setup synchronizer**

```ts
export const AUDIO_SHORTCUT = 'CommandOrControl+Shift+Return'

export interface ToggleShortcutDeps extends ShortcutDeps {
  unregister: (accelerator: string) => void
  isRegistered: (accelerator: string) => boolean
}

export function syncAudioSetupShortcut(
  canOwnHotkey: boolean,
  onSetup: () => void,
  deps: ToggleShortcutDeps
): boolean {
  if (canOwnHotkey) {
    if (deps.isRegistered(AUDIO_SHORTCUT)) deps.unregister(AUDIO_SHORTCUT)
    return true
  }
  if (deps.isRegistered(AUDIO_SHORTCUT)) return true
  return deps.register(AUDIO_SHORTCUT, onSetup)
}
```

Import `AUDIO_SHORTCUT` in `register-shortcuts.ts`. In `index.ts`, register all defaults without an omit set. Replace `registerScreenshotFallback` with `syncAudioFallback`, whose callback sends `request-permissions` once and shows an actionable Accessibility/Microphone/Screen Recording/Speech Recognition setup message. `updateNativePermissions` calls the synchronizer using `event.permissions.canOwnHotkey`; `onUnavailable` enables it. Change native `tap` handling to log and ignore the compatibility event.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run tests/register-shortcuts.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no unused `MainEvent` or `DEFAULT_SHORTCUTS` imports in `index.ts`.

- [ ] **Step 5: Commit Electron shortcut ownership**

```bash
git add src/shared/shortcuts.ts src/main/register-shortcuts.ts src/main/index.ts tests/register-shortcuts.test.ts
git commit -m "feat: separate screenshot and audio shortcut ownership"
```

### Task 4: Update visible instructions, metadata, and smoke coverage

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `electron-builder.yml`
- Modify: `README.md`
- Modify: `docs/SMOKE.md`
- Modify: `docs/RELEASE_NOTES.md`

**Interfaces:**
- Produces: user-facing copy that consistently says `⌘⏎` screenshot and hold `⌘⇧⏎` audio + screen.

- [ ] **Step 1: Update the overlay footer and macOS permission text**

Use these exact labels in `App.tsx`:

```tsx
<span>⌘⏎ screenshot</span>
<span>hold ⌘⇧⏎ audio + screen</span>
```

Use this exact microphone usage description in `electron-builder.yml`:

```yaml
NSMicrophoneUsageDescription: Ghostpane records microphone audio only while Command+Shift+Return is held.
```

- [ ] **Step 2: Update download and manual-test documentation**

Replace every current instruction that says to hold `⌘⏎` with hold `⌘⇧⏎`; retain tap `⌘⏎` for screenshots. In `docs/SMOKE.md`, add explicit short-tap-no-op, modifier-first release, missing-Accessibility audio setup, and no-stray-newline checks.

- [ ] **Step 3: Verify stale copy is gone**

Run: `rg -n "hold (it|Command\+Return|⌘⏎)|while Command\+Return is held|then hold Command\+Return" README.md docs/SMOKE.md docs/RELEASE_NOTES.md src native electron-builder.yml`

Expected: no stale current-version instructions; historical design specs may still document their original behavior and are excluded from edits.

- [ ] **Step 4: Commit the user-facing shortcut update**

```bash
git add src/renderer/App.tsx electron-builder.yml README.md docs/SMOKE.md docs/RELEASE_NOTES.md
git commit -m "docs: explain the dedicated audio shortcut"
```

### Task 5: Verify the complete hotkey slice

**Files:**
- Verify only; do not edit unrelated files.

**Interfaces:**
- Validates: native matcher, helper state machine, Electron ownership, user-facing shortcut copy.

- [ ] **Step 1: Run all automated checks**

Run: `npm test`

Expected: all TypeScript tests PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run native:test`

Expected: all Swift tests PASS.

- [ ] **Step 2: Build the helper and renderer**

Run: `npm run build`

Expected: universal native helper build and Electron renderer build both succeed.

- [ ] **Step 3: Inspect the cumulative diff**

Run: `git diff dfa8749 --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: clean worktree before beginning the math plan.
