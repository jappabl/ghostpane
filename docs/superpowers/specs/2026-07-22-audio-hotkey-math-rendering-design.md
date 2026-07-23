# Separate Audio Hotkey and Reliable Math Rendering Design

**Date:** 2026-07-22
**Status:** Approved in conversation; awaiting written-spec review

## Objective

Make screenshot and audio actions unambiguous, and render AI-generated mathematics as readable equations instead of exposed LaTeX commands.

- Tap `Command+Return` for the existing screenshot-only ask.
- Hold `Command+Shift+Return` for microphone and system-audio context.
- Keep press-and-hold mandatory for audio submission.
- Render standard inline and display LaTeX with KaTeX.
- Preserve code, currency, literal brackets, and malformed math without crashing or silently deleting content.

This work extends the v0.2.0 provider/audio architecture. It does not add configurable shortcuts, MathJax, arbitrary TeX packages, or cloud math rendering.

## User Experience

### Separate shortcuts

`Command+Return` always performs a screenshot-only ask. It never starts an audio buffer and never triggers audio permission prompts.

`Command+Shift+Return` is audio-only:

1. Key-down starts buffering microphone and system audio.
2. Holding for 350 ms displays the red recording indicator and elapsed time.
3. Releasing either required modifier or Return after the threshold stops capture, transcribes locally, takes a fresh screenshot, and submits the combined context.
4. Releasing before 350 ms discards the buffered audio and submits nothing.

When Accessibility permission is missing, Electron temporarily owns `Command+Shift+Return`. Its first press opens the existing permission setup and explains that the user must grant access and retry. Screenshot-only `Command+Return` remains available throughout. Once the helper reports Accessibility access, Electron unregisters only the temporary audio setup shortcut and the native helper exclusively owns `Command+Shift+Return`.

The command bar and footer describe the two shortcuts separately:

- `⌘⏎` screenshot
- hold `⌘⇧⏎` audio + screen

### Mathematical output

Answers render standard KaTeX-supported mathematics rather than showing delimiter characters or commands such as `\iint`, `\frac`, `\theta`, `\,`, and `\boxed` as plain text.

Supported input forms are:

- Inline dollar math: `$x^2+y^2$`
- Display dollar math: `$$\int_0^1 r^4\,dr$$`
- Inline LaTeX delimiters: `\(...\)`
- Display LaTeX delimiters: `\[...\]`
- Conservative display fallback for a standalone `[ ... ]` block only when its contents contain clear LaTeX commands
- Multiline KaTeX environments such as `aligned`, `gathered`, `matrix`, `pmatrix`, and `cases`

The user's example must render as three display equations followed by a boxed `\pi/5`, with correct integral symbols, exponents, differentials, fractions, Greek letters, and spacing.

## Architecture

### Native hotkey matching

`GlobalHotkeyMonitor` changes from a Command+Return matcher to an exact Command+Shift+Return matcher. Pure matcher functions accept key code, Command state, Shift state, repeat state, and active-press state so modifier-order edge cases remain unit-testable.

The event tap:

- Suppresses only the audio chord and its repeats.
- Leaves Command+Return untouched for Electron's screenshot shortcut.
- Finishes an active audio hold if Command, Shift, or Return is released first.
- Continues to suppress the eventual Return key-up after a modifier-first release so the foreground app receives no stray newline.

The helper still buffers on key-down to avoid losing the first syllable. Its short-press path cancels capture without emitting a screenshot event.

### Electron shortcut ownership

Electron registers all existing shortcuts, including screenshot `CommandOrControl+Return`, without omitting it when the helper is available.

A new shared `AUDIO_SHORTCUT` constant is `CommandOrControl+Shift+Return`. Electron registers it only as a permission/setup fallback while the helper cannot own global input. Permission-state events toggle this audio fallback; they no longer toggle the screenshot shortcut. Native `tap` events are ignored for compatibility with a helper updated out of order.

### Math normalization

A focused `normalizeMathDelimiters(markdown)` function runs before `react-markdown`.

It converts:

- `\(...\)` to `$...$`
- `\[...\]` to `$$...$$`
- Clearly mathematical standalone bracket blocks to `$$...$$`

The normalizer uses a small state scanner rather than a global regular expression. It does not transform content inside fenced code blocks, inline code spans, or escaped literals. The bracket fallback requires a LaTeX command and line-level standalone delimiters, avoiding Markdown links, ordinary prose brackets, and arrays.

Existing `$...$` and `$$...$$` content passes through unchanged for `remark-math` to parse. Before parsing, the same scanner escapes unambiguous currency-shaped dollar tokens such as `$5`, `$5.00`, and `$5–$10`; a dollar-delimited expression such as `$5$` remains math. Already escaped dollar signs remain text. This classification prevents two prices in one sentence from being paired into accidental inline math.

### Rendering

The renderer adds:

- `remark-math` for Markdown math nodes
- `rehype-katex` for safe HTML/MathML generation
- `katex` and its stylesheet

KaTeX is configured without trusted HTML commands or raw-HTML processing. Malformed or unsupported expressions render their original source with an error style instead of throwing the React tree away. Display equations use horizontal overflow inside the answer panel, while inline equations remain aligned with surrounding text. KaTeX's generated MathML remains present for assistive technology.

### Provider guidance

The shared request guidance tells both providers to use `$...$` for inline math and `$$...$$` for display math. Rendering does not depend on provider compliance because the normalizer accepts the common slash-delimiter forms as well.

## Safety and Compatibility

- No `rehype-raw`, `dangerouslySetInnerHTML`, remote scripts, or network math service.
- KaTeX `trust` remains disabled.
- Code examples containing LaTeX remain code.
- Dollar-denominated prose remains prose.
- Unknown TeX packages and malformed expressions remain visible as source with a nonfatal error treatment.
- Existing non-math Markdown, external-link validation, answer streaming, and provider routing remain unchanged.
- A partially updated helper cannot turn the audio hotkey into a screenshot ask because Electron ignores native `tap` events.

## Testing

### Swift

- Command+Shift+Return matches; Command+Return does not.
- Autorepeat is suppressed only during an active audio chord.
- Releasing Command, Shift, or Return completes/cancels exactly once.
- A short audio press cancels capture and emits no screenshot action.

### TypeScript and renderer

- Screenshot shortcut is always registered.
- Audio fallback is distinct and only present without helper ownership.
- Slash delimiters normalize to dollar delimiters.
- Existing dollar math is unchanged.
- Inline code, fenced code, currency (including `Costs $5 and $10` and `$5–$10`), escaped delimiters, links, and literal brackets are unchanged.
- Multiline environments, matrices, cases, integrals, sums, fractions, roots, Greek symbols, accents, limits, spacing commands, and boxed answers render through KaTeX.
- Malformed and unsupported expressions do not crash rendering and retain readable source.
- The exact user-provided right-half-disk integral produces KaTeX display output.

### Verification

- Full TypeScript tests and typecheck.
- Full Swift tests.
- Production build and Apple Silicon package.
- Installed app signature and process verification.
- Manual screenshot ask with `Command+Return`.
- Manual short and held `Command+Shift+Return` checks after granting Accessibility.
- Visual check of inline, display, multiline, malformed, code, and currency fixtures.

## Success Criteria

1. `Command+Return` performs screenshot-only asks regardless of audio permissions.
2. Only a held `Command+Shift+Return` submits audio context.
3. Short audio-key taps submit nothing and leave no raw recordings.
4. No hotkey event leaks a Return keystroke to the foreground application.
5. Standard KaTeX-supported math renders correctly for both providers and all documented delimiter forms.
6. Code, currency, literal text, links, and malformed math remain safe and readable.
7. Tests, typecheck, Swift tests, production build, installed-app verification, and the focused manual checks pass.
