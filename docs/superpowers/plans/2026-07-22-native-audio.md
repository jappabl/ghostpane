# Native Press-and-Hold Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add true global press-and-hold `Command+Return` capture of microphone and system audio with local English transcription and screenshot-plus-transcript asks.

**Architecture:** A bundled universal Swift helper owns macOS input monitoring, ScreenCaptureKit, AVFoundation, Speech.framework, permissions, and temporary audio. It exposes a versioned JSONL event protocol to a focused Electron bridge; Electron keeps a screenshot-only globalShortcut fallback whenever the helper lacks Accessibility permission.

**Tech Stack:** Swift Package Manager, Swift 6, CoreGraphics/ApplicationServices, ScreenCaptureKit, AVFoundation, Speech.framework, Electron child processes, TypeScript, Vitest.

## Global Constraints

- Held audio requires macOS 14 or newer.
- True key-down/key-up semantics are mandatory.
- Tap under 350 ms remains screenshot-only.
- Hold records microphone and system audio from key-down through key-up.
- Transcription is English and requires on-device Speech recognition.
- Raw audio never leaves the Mac and is deleted before completion/error is emitted.
- Users who decline Accessibility retain the existing screenshot-only shortcut.
- No third-party native Node addons or downloaded transcription models.

---

### Task 1: Swift package, JSONL protocol, and hotkey state machine

**Files:**
- Create: `native/Package.swift`
- Create: `native/Sources/GhostpaneNativeCore/Protocol.swift`
- Create: `native/Sources/GhostpaneNativeCore/HotkeyStateMachine.swift`
- Create: `native/Tests/GhostpaneNativeCoreTests/ProtocolTests.swift`
- Create: `native/Tests/GhostpaneNativeCoreTests/HotkeyStateMachineTests.swift`

**Interfaces:**
- Produces: `HelperEvent`, `ProtocolWriter`, and `HotkeyStateMachine`.
- `HotkeyStateMachine` consumes monotonic key-down/up times and emits `.tap`, `.holdStarted`, or `.holdFinished` exactly once.

- [ ] **Step 1: Create the Swift package and failing state tests**

```swift
func testShortPressEmitsTapOnly() {
    var events: [HotkeyAction] = []
    let state = HotkeyStateMachine(threshold: .milliseconds(350)) { events.append($0) }
    state.keyDown(at: .zero)
    state.keyUp(at: .milliseconds(120))
    XCTAssertEqual(events, [.tap])
}

func testHoldIgnoresAutorepeatAndFinishesOnce() {
    var events: [HotkeyAction] = []
    let state = HotkeyStateMachine(threshold: .milliseconds(350)) { events.append($0) }
    state.keyDown(at: .zero)
    state.keyDown(at: .milliseconds(20))
    state.thresholdReached(at: .milliseconds(350))
    state.keyUp(at: .milliseconds(800))
    XCTAssertEqual(events, [.holdStarted, .holdFinished])
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `swift test --package-path native`

Expected: compile failure because the core types are missing.

- [ ] **Step 3: Implement deterministic protocol and state machine**

Use `ContinuousClock.Instant` in production and injectable `Duration` values in tests. JSON events include `protocolVersion: 1` and a `type` discriminator. `ProtocolWriter` serializes one event per line under a lock and flushes stdout.

- [ ] **Step 4: Run Swift tests**

Run: `swift test --package-path native`

Expected: PASS.

- [ ] **Step 5: Commit Swift core**

```bash
git add native/Package.swift native/Sources/GhostpaneNativeCore native/Tests/GhostpaneNativeCoreTests
git commit -m "feat: add native hotkey protocol core"
```

### Task 2: Permissions and global key monitor

**Files:**
- Create: `native/Sources/GhostpaneNativeCore/Permissions.swift`
- Create: `native/Sources/GhostpaneNativeCore/GlobalHotkeyMonitor.swift`
- Create: `native/Tests/GhostpaneNativeCoreTests/PermissionsTests.swift`
- Modify: `native/Sources/GhostpaneNativeCore/Protocol.swift`

**Interfaces:**
- Produces: `PermissionState` with accessibility, microphone, screen, speech, and `audioSupported` fields.
- Produces: `GlobalHotkeyMonitor.start()` and `stop()` callbacks for Command+Return down/up.

- [ ] **Step 1: Write failing permission mapping tests**

```swift
func testAudioReadinessRequiresEveryPermissionAndMacOS14() {
    let state = PermissionState(
        accessibility: .granted, microphone: .granted,
        screen: .granted, speech: .granted, macOSMajor: 14
    )
    XCTAssertTrue(state.audioSupported)
    XCTAssertFalse(state.replacing(microphone: .denied).audioSupported)
    XCTAssertFalse(state.replacing(macOSMajor: 13).audioSupported)
}
```

- [ ] **Step 2: Verify failure**

Run: `swift test --package-path native --filter PermissionsTests`

Expected: compile failure because `PermissionState` is missing.

- [ ] **Step 3: Implement permission inspection and requests**

Use `AXIsProcessTrustedWithOptions`, `AVCaptureDevice.authorizationStatus(for: .audio)`, `CGPreflightScreenCaptureAccess`, and `SFSpeechRecognizer.authorizationStatus()`. Permission requests are explicit helper commands; startup inspection must not unexpectedly open prompts.

- [ ] **Step 4: Implement the suppressing event tap**

Create a session event tap for `.keyDown`, `.keyUp`, and `.flagsChanged`. Match virtual key code 36 with `.maskCommand`, ignore autorepeat, and return `nil` for handled Command+Return events so the foreground app receives no newline. Re-enable the tap after timeout/user-input disable callbacks.

- [ ] **Step 5: Run Swift tests and commit**

Run: `swift test --package-path native`

Expected: PASS.

```bash
git add native/Sources/GhostpaneNativeCore native/Tests/GhostpaneNativeCoreTests
git commit -m "feat: monitor global hold shortcut"
```

### Task 3: Microphone and system-audio recording with cleanup

**Files:**
- Create: `native/Sources/GhostpaneNativeCore/AudioCapture.swift`
- Create: `native/Sources/GhostpaneNativeCore/SystemAudioWriter.swift`
- Create: `native/Sources/GhostpaneNativeCore/TemporaryAudio.swift`
- Create: `native/Tests/GhostpaneNativeCoreTests/TemporaryAudioTests.swift`

**Interfaces:**
- Produces: `AudioCapture.start() async`, `AudioCapture.stop() async -> AudioArtifacts`.
- `AudioArtifacts` owns `microphoneURL`, `systemURL`, and `cleanup()`.

- [ ] **Step 1: Write failing cleanup tests**

```swift
func testArtifactsDeleteBothFilesIdempotently() throws {
    let urls = try makeTwoTemporaryFiles()
    let artifacts = AudioArtifacts(microphoneURL: urls.0, systemURL: urls.1)
    artifacts.cleanup(); artifacts.cleanup()
    XCTAssertFalse(FileManager.default.fileExists(atPath: urls.0.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: urls.1.path))
}
```

- [ ] **Step 2: Verify failure**

Run: `swift test --package-path native --filter TemporaryAudioTests`

Expected: compile failure because `AudioArtifacts` is missing.

- [ ] **Step 3: Implement microphone recording**

Use `AVAudioEngine.inputNode`, install one tap, and write PCM buffers to a unique `.caf` file beneath `FileManager.default.temporaryDirectory/ghostpane-audio/`. Reject overlapping starts and always remove the tap during stop/error.

- [ ] **Step 4: Implement ScreenCaptureKit system-audio recording**

Use `SCShareableContent`, select the active display, create an `SCContentFilter`, set `capturesAudio = true`, `excludesCurrentProcessAudio = true`, 48 kHz stereo, and attach an `.audio` `SCStreamOutput`. `SystemAudioWriter` appends valid audio sample buffers to a unique `.m4a` through `AVAssetWriter`; video frames are ignored.

- [ ] **Step 5: Make capture startup and teardown transactional**

If either source fails to start, stop the other and delete both partial files. `stop()` waits for both writers to finish and returns owned artifacts only after file finalization.

- [ ] **Step 6: Run Swift tests and commit**

Run: `swift test --package-path native`

Expected: PASS without requiring live recording in unit tests.

```bash
git add native/Sources/GhostpaneNativeCore native/Tests/GhostpaneNativeCoreTests
git commit -m "feat: capture microphone and system audio"
```

### Task 4: Local transcription and helper executable

**Files:**
- Create: `native/Sources/GhostpaneNativeCore/Transcriber.swift`
- Create: `native/Sources/GhostpaneNativeCore/HelperController.swift`
- Create: `native/Sources/GhostpaneHelper/main.swift`
- Create: `native/Tests/GhostpaneNativeCoreTests/HelperControllerTests.swift`
- Modify: `native/Package.swift`

**Interfaces:**
- Produces: `Transcriber.transcribe(url:) async throws -> String`.
- Produces the `GhostpaneHelper` executable and JSONL lifecycle events.

- [ ] **Step 1: Write failing controller tests with fake capture/transcription**

```swift
func testHoldCompletionLabelsTranscriptsAndCleansArtifacts() async throws {
    let capture = FakeCapture(microphone: "hello", system: "meeting audio")
    let controller = HelperController(capture: capture, transcriber: FakeTranscriber())
    await controller.holdStarted()
    let event = await controller.holdFinished()
    XCTAssertEqual(event.microphoneTranscript, "hello")
    XCTAssertEqual(event.systemTranscript, "meeting audio")
    XCTAssertTrue(capture.artifactsWereCleaned)
}
```

- [ ] **Step 2: Verify failure**

Run: `swift test --package-path native --filter HelperControllerTests`

Expected: compile failure because controller types are missing.

- [ ] **Step 3: Implement on-device English transcription**

Use `SFSpeechRecognizer(locale: Locale(identifier: "en-US"))`, require `supportsOnDeviceRecognition`, create `SFSpeechURLRecognitionRequest`, set `requiresOnDeviceRecognition = true`, and bridge the final callback to async/await. Empty speech becomes `No speech detected`; network fallback is forbidden.

- [ ] **Step 4: Implement controller terminal-state cleanup**

Transcribe microphone and system artifacts separately, await both results, call `artifacts.cleanup()` in `defer`, and emit no raw paths. Cancellation and every thrown error also clean artifacts before emitting `error`.

- [ ] **Step 5: Implement the executable run loop**

Inspect permissions, emit `ready` and `permission-state`, start the event tap only when Accessibility is granted, connect hotkey actions to the controller, accept only versioned JSONL commands on stdin, and stop all resources on SIGTERM.

- [ ] **Step 6: Run Swift tests and commit**

Run: `swift test --package-path native`

Expected: PASS.

```bash
git add native/Package.swift native/Sources native/Tests
git commit -m "feat: transcribe held audio locally"
```

### Task 5: Electron helper bridge and tap fallback

**Files:**
- Create: `src/main/native-helper.ts`
- Create: `src/main/audio-context.ts`
- Modify: `src/main/register-shortcuts.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/native-helper.test.ts`
- Modify: `tests/register-shortcuts.test.ts`

**Interfaces:**
- Produces: `NativeHelper.start()`, `stop()`, typed event callbacks, one-restart policy.
- Produces: `buildAudioPrompt(typedPrompt, microphoneTranscript, systemTranscript)`.

- [ ] **Step 1: Write failing JSONL, restart, and prompt tests**

```ts
it('parses split JSONL helper output', () => {
  const events = parseHelperChunks(['{"protocolVersion":1,', '"type":"tap"}\n'])
  expect(events).toEqual([{ protocolVersion: 1, type: 'tap' }])
})

expect(buildAudioPrompt('', 'my question', 'speaker response')).toContain(
  'Microphone transcript:\nmy question\n\nSystem audio transcript:\nspeaker response'
)
```

- [ ] **Step 2: Verify failure**

Run: `./node_modules/.bin/vitest run tests/native-helper.test.ts`

Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Implement helper discovery and protocol parsing**

Resolve packaged helper from `process.resourcesPath/native/ghostpane-helper` and development helper from `build/native/ghostpane-helper`. Validate protocol version and every event shape. Log stderr separately. Restart once after unexpected exit; then disable held audio for the session.

- [ ] **Step 4: Integrate shortcut ownership and audio request flow**

Change `registerShortcuts()` to accept an omitted-event set. When helper readiness says Accessibility is granted, omit `ask-screenshot`; otherwise retain its existing globalShortcut. Map helper `tap` to screenshot ask. Map `hold-started` and progress to recording UI status. Map `hold-finished` to labeled prompt construction, fresh screenshot capture, and selected-provider routing.

When the helper reports macOS older than 14, keep the screenshot shortcut and surface held audio as unavailable. When permissions are missing, send explicit helper request commands for Microphone and Speech, call the existing Screen Recording settings route, and open the Accessibility pane through a validated main-process action. The renderer never receives arbitrary settings URLs.

- [ ] **Step 5: Add recording status UI**

Add a red recording dot/timer state driven by `main:recording`. Preserve explicit transcribing, screenshot, and provider-thinking statuses. The screenshot button remains usable when native audio is unavailable.

- [ ] **Step 6: Run all code tests and Swift tests**

Run: `swift test --package-path native && ./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`

Expected: PASS.

- [ ] **Step 7: Commit Electron integration**

```bash
git add src/main/native-helper.ts src/main/audio-context.ts src/main/register-shortcuts.ts src/main/index.ts src/shared/ipc.ts src/renderer/App.tsx src/renderer/styles.css tests/native-helper.test.ts tests/register-shortcuts.test.ts
git commit -m "feat: add press-and-hold audio asks"
```
