# Ghostpane Audio, ChatGPT, and Hardening Design

**Date:** 2026-07-22
**Status:** Approved

## Objective

Extend Ghostpane without changing its one-app installation experience:

- Make ChatGPT, through Codex CLI subscription authentication, the default AI provider.
- Keep Claude available through the existing Claude CLI integration.
- Preserve tap `Command+Return` as the screenshot-only command.
- Add true press-and-hold `Command+Return` recording of microphone and macOS system audio.
- On release, transcribe both audio sources locally, capture the screen, and send all context to the selected provider.
- Close the renderer-navigation and IPC trust-boundary gaps.
- Delete sensitive temporary captures after every request.
- Produce signed ARM64 and Intel DMGs as GitHub release assets.

The audio feature targets macOS 14 and newer. On older supported macOS versions, Ghostpane retains screenshot-only behavior and explains that held audio capture requires macOS 14.

## User Experience

### Provider selection

The command bar contains a provider selector followed by a provider-specific model selector.

- `ChatGPT` is selected for first-time users.
- `Claude` remains a one-click alternative.
- The selected provider and its selected model are persisted in settings.
- ChatGPT uses the user's saved `codex login` session. No OpenAI API key is required.
- Claude uses the user's saved Claude CLI session as it does today.

The ChatGPT model choices are Default, Sol, Terra, and Luna. Default delegates model selection to Codex CLI. Claude retains Default, Opus, Sonnet, and Haiku.

### Tap and hold behavior

`Command+Return` has two meanings based on duration:

1. On key-down, the native helper starts buffering microphone and system audio immediately.
2. If key-up occurs before 350 ms, the helper discards the audio and emits a `tap` event. Ghostpane performs the current screenshot-only ask.
3. If the key remains down for 350 ms, the helper emits `hold-started`. Ghostpane shows a red recording indicator and elapsed time.
4. On key-up after the threshold, the helper stops recording, transcribes microphone and system audio separately, and emits `hold-finished` with labeled transcripts.
5. Ghostpane hides the overlay, captures a fresh screenshot, restores the overlay, and asks the selected provider using the screenshot and both transcripts.

Starting the audio buffers on key-down prevents the first syllable from being lost. Audio from a short tap is immediately discarded.

### Status and errors

The overlay displays explicit phases:

- `Recording microphone + system audio…`
- `Transcribing audio locally…`
- `Taking screenshot…`
- `Asking ChatGPT…` or `Asking Claude…`

Permission and authentication failures use actionable messages rather than generic errors. The first held invocation may require macOS approval for Accessibility/Input Monitoring, Microphone, Screen Recording, and Speech Recognition. Ghostpane links users to the relevant System Settings pane and tells them when an app restart is required.

If a selected CLI is missing or signed out, Ghostpane identifies the provider and shows the exact setup command (`codex login` or `claude login`). Provider failures do not silently fall back to the other provider.

## Architecture

### Native helper

A small Swift executable is built for each target architecture and packaged inside `Ghostpane.app/Contents/Resources/native/`.

It owns the macOS-only capabilities Electron cannot provide reliably:

- A `CGEventTap` for global `Command+Return` key-down and key-up events.
- ScreenCaptureKit system-audio capture with Ghostpane's own process audio excluded.
- Microphone capture through AVFoundation.
- Local English transcription through Speech.framework with on-device recognition required.
- Permission inspection and requests for Accessibility/Input Monitoring, Microphone, Screen Recording, and Speech Recognition.

The helper communicates with Electron over newline-delimited JSON on stdin/stdout. It never opens a network connection. Each message contains a versioned event name and validated scalar payloads. Diagnostic output goes to stderr so it cannot corrupt the protocol.

The event tap suppresses the handled `Command+Return` events so the foreground application does not receive a stray Return key while Ghostpane is recording.

Expected helper events are:

- `ready`
- `permission-state`
- `tap`
- `hold-started`
- `hold-progress`
- `hold-finished`
- `hold-cancelled`
- `error`

`hold-finished` contains transcript strings, durations, and no audio file paths. The helper deletes its temporary recordings before emitting completion. If transcription or recording fails, it deletes partial files before emitting an error.

When Accessibility permission is granted, Electron's existing `globalShortcut` registration no longer registers `Command+Return`; the helper exclusively owns that shortcut to avoid duplicate events. If Accessibility permission is absent or the helper is unavailable, Electron registers the existing screenshot-only `Command+Return` shortcut as a fallback. Granting Accessibility and restarting Ghostpane upgrades that shortcut to tap-or-hold behavior. Other shortcuts remain unchanged.

### Native helper lifecycle

Electron starts the helper after `app.whenReady()`, verifies the protocol version from its `ready` event, and restarts it once after an unexpected exit. A second unexpected exit disables held audio capture for the session and shows a diagnostic error; screenshot asks remain available through the UI button.

Development builds resolve the helper from the repository build directory. Packaged builds resolve it from `process.resourcesPath/native`. The helper is terminated during Electron shutdown.

### Provider boundary

Provider-specific process handling moves behind a shared interface:

```ts
interface AiProvider {
  id: 'openai' | 'claude'
  resolve(): ProviderAvailability
  ask(options: ProviderAskOptions): ProviderRun
}
```

`ProviderAskOptions` contains the prompt, optional screenshot path, selected model, callbacks, and an abort signal. Both providers return through the same chunk/done/error callbacks. The orchestration layer does not assemble provider-specific command arguments.

#### ChatGPT provider

The ChatGPT provider resolves `codex` from common CLI install locations and the inherited PATH. It uses saved ChatGPT subscription authentication from `codex login`.

It launches a noninteractive, ephemeral, read-only command from an empty temporary working directory:

```text
codex exec --ephemeral --skip-git-repo-check --sandbox read-only
  --ignore-rules --ignore-user-config --json [--model MODEL]
  [--image SCREENSHOT] PROMPT
```

The adapter parses JSONL events, surfaces agent-message content, and converts process/authentication errors into user-facing messages. Codex CLI may produce completed answer chunks rather than token deltas; the UI keeps the thinking state visible until content arrives.

The current recommended explicit model is `gpt-5.6-sol`, but Ghostpane's persisted default is the empty model value so Codex CLI can follow the user's subscription and current recommended default. Explicit Sol, Terra, and Luna selections map to their supported Codex model identifiers.

#### Claude provider

The existing Claude process parser becomes the Claude implementation of the shared provider interface. Its prompt behavior and token streaming remain unchanged.

### Request context

An audio-and-screen request contains:

```text
<typed prompt, if present>

Microphone transcript:
<local transcript or "No speech detected">

System audio transcript:
<local transcript or "No speech detected">
```

The screenshot is attached through the provider's native image mechanism: `--image` for Codex and the existing readable image-path instruction for Claude. Transcript labels are retained so the model can distinguish the user from meeting, video, or application audio.

## Security Hardening

### Navigation

The renderer must never navigate to model-controlled content.

- Markdown links are rendered through a custom external-link component.
- Trusted `https:` URLs open with `shell.openExternal` after URL validation.
- `will-navigate` prevents any navigation away from the packaged renderer or configured development origin.
- `setWindowOpenHandler` denies new windows and routes validated web URLs externally.
- Other URL schemes are rejected.

### IPC

Every renderer-to-main listener validates both the sender and payload.

- The sender must be the current main frame of Ghostpane's renderer webContents.
- The frame URL must match the packaged renderer or configured development origin.
- Ask requests require a bounded string prompt and a boolean screenshot flag.
- Provider and model values must match provider-specific allowlists.
- Resize values must be finite numbers within the existing window bounds.
- Boolean channels accept only literal booleans.

Invalid messages are logged and ignored. The preload bridge exposes only the existing narrow operations plus `setProvider`; it does not expose shell or filesystem primitives.

### Sensitive temporary files

Screenshot capture returns an owned temporary path. The request orchestration layer tracks every owned path and unlinks it exactly once after provider completion, provider error, spawn failure, or cancellation. Cleanup failures are logged without replacing the original result.

The Swift helper applies the equivalent guarantee to microphone and system-audio recordings and passes only transcripts to Electron.

## Settings and Compatibility

Settings migrate additively:

```ts
interface Settings {
  provider: 'openai' | 'claude'
  models: {
    openai: string
    claude: string
  }
}
```

Existing users with only the legacy `model` setting retain that value as their Claude model, while their provider defaults to ChatGPT. Unknown persisted values are replaced with provider defaults instead of being passed to a CLI.

Audio capture is enabled only on macOS 14+. The app continues to build and run elsewhere, but the helper is not launched and held recording is reported as unavailable. Windows support remains out of scope.

## Packaging and GitHub Releases

The user-facing artifact remains a DMG. Every release contains:

- `Ghostpane-<version>-arm64.dmg`
- `Ghostpane-<version>.dmg` for Intel x64

No separate helper, transcription model, runtime, or package installation is required. The architecture-matching helper executable is bundled inside each application.

The release workflow:

1. Installs Node dependencies.
2. Runs JavaScript/TypeScript tests and type checking.
3. Compiles and tests the Swift helper for the target architecture.
4. Imports the stable signing certificate from encrypted GitHub Actions secrets into a temporary keychain.
5. Builds the matching app and DMG.
6. Verifies the nested helper signature, app signature, architecture, and DMG presence.
7. Uploads both DMGs to the tag's GitHub release.
8. Deletes the temporary keychain even after failure.

Required repository secrets are `GHOSTPANE_CERT_P12_BASE64`, containing the base64-encoded PKCS#12 signing identity, and `GHOSTPANE_CERT_PASSWORD`. The workflow creates a temporary keychain with a per-run random password and imports the identity named `Ghostpane Local Signing`. It fails before packaging when either secret is missing. It must never silently upload an unsigned build.

The local publish script applies the same build, architecture, and signature checks before uploading release assets.

## Testing

### TypeScript unit tests

- Tap and hold event orchestration.
- Provider availability and provider-specific model validation.
- Codex argument construction and JSONL parsing.
- Existing Claude streaming behavior through the shared interface.
- Settings migration and persistence.
- IPC sender, origin, and payload rejection.
- Navigation allow/deny decisions.
- Screenshot cleanup on done, error, spawn failure, and cancellation.

### Swift tests

- Key-event state machine: tap, threshold crossing, hold, repeated key-down, cancellation.
- JSONL protocol encoding and malformed-command rejection.
- Transcript labeling and no-speech behavior.
- Temporary audio cleanup on all terminal states.
- Permission-state mapping.

Hardware frameworks are hidden behind protocols so state-machine and cleanup behavior can be tested without recording real audio. Real capture remains part of the macOS smoke test.

### Build and smoke verification

- `npm test`
- `npm run typecheck`
- Swift helper tests
- Production Electron build
- Signed ARM64 and x64 package builds
- Existing capture-exclusion smoke checks
- Tap screenshot ask
- Held microphone-only speech
- Held system-audio-only speech
- Held simultaneous microphone and system audio
- ChatGPT default-provider ask using `codex login`
- Switching to Claude and back
- Permission denial and recovery
- Confirmation that temporary media is removed

## Out of Scope

- Windows or Linux audio capture.
- macOS versions older than 14 for held audio recording.
- Cloud transcription or OpenAI API-key transcription.
- Speaker diarization within one audio source.
- Conversation history across asks.
- Automatic fallback from one AI provider to another.
- Shipping or downloading a third-party transcription model.

## Success Criteria

The work is complete when:

1. A first-time user can download one architecture-appropriate DMG from GitHub and install Ghostpane as before.
2. ChatGPT is the default and works through a saved ChatGPT/Codex CLI subscription login without an API key.
3. Claude remains selectable and preserves existing behavior.
4. Tapping `Command+Return` performs a screenshot-only ask.
5. Holding `Command+Return` records both sources, releasing transcribes locally, and the selected provider receives both labeled transcripts plus a screenshot.
6. Remote Markdown cannot navigate the privileged renderer, and invalid IPC is rejected.
7. Temporary screenshots and audio recordings are removed on every terminal path.
8. Automated tests, type checking, Swift tests, production build, signature verification, and release packaging pass.
9. GitHub releases contain signed ARM64 and Intel DMGs and no unsigned application is published.
