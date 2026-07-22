# ChatGPT Provider and Electron Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ChatGPT/Codex the default selectable provider while hardening renderer navigation, IPC validation, settings migration, and temporary screenshot cleanup.

**Architecture:** Shared provider metadata supplies renderer and main-process allowlists. Provider-specific adapters own CLI discovery, argument construction, and output parsing behind one request interface. Small pure validation and cleanup modules keep the Electron trust boundary testable.

**Tech Stack:** Electron 33, TypeScript 5.7, React 18, Vitest 2, Codex CLI JSONL, Claude CLI stream-json.

## Global Constraints

- ChatGPT is the first-run default; Claude remains selectable.
- ChatGPT uses saved `codex login` subscription authentication and never requires an API key.
- Codex runs ephemeral, read-only, outside the project, with user config and rules disabled.
- Renderer content cannot navigate the privileged BrowserWindow.
- Every renderer-to-main message validates sender origin and payload.
- Every owned screenshot path is deleted on success, error, spawn failure, and cancellation.
- Existing Claude token streaming and screenshot behavior remain intact.

---

### Task 1: Shared provider catalog and settings migration

**Files:**
- Create: `src/shared/providers.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces: `ProviderId`, `PROVIDERS`, `modelsForProvider()`, `isProviderId()`, `isModelForProvider()`.
- Produces: `Settings { provider, models }`, `setProvider()`, and provider-aware `setModel()`.

- [ ] **Step 1: Write failing provider and migration tests**

```ts
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/ghostpane-settings-test' } }))

it('migrates the legacy Claude model while defaulting provider to OpenAI', () => {
  mockStored({ model: 'sonnet' })
  expect(getSettings()).toEqual({
    provider: 'openai',
    models: { openai: '', claude: 'sonnet' }
  })
})

it('rejects unknown persisted provider and model values', () => {
  mockStored({ provider: 'evil', models: { openai: '--bad', claude: 'bogus' } })
  expect(getSettings()).toEqual({
    provider: 'openai',
    models: { openai: '', claude: '' }
  })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `./node_modules/.bin/vitest run tests/settings.test.ts`

Expected: FAIL because provider-aware settings and catalog exports do not exist.

- [ ] **Step 3: Add the catalog and migrated settings implementation**

```ts
export type ProviderId = 'openai' | 'claude'

export const PROVIDERS = [
  { id: 'openai', label: 'ChatGPT', models: [
    { id: '', label: 'Default' },
    { id: 'gpt-5.6-sol', label: 'Sol' },
    { id: 'gpt-5.6-terra', label: 'Terra' },
    { id: 'gpt-5.6-luna', label: 'Luna' }
  ] },
  { id: 'claude', label: 'Claude', models: [
    { id: '', label: 'Default' },
    { id: 'opus', label: 'Opus' },
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'haiku', label: 'Haiku' }
  ] }
] as const

export const isProviderId = (value: unknown): value is ProviderId =>
  value === 'openai' || value === 'claude'

export function isModelForProvider(provider: ProviderId, value: unknown): value is string {
  return typeof value === 'string' && PROVIDERS
    .find((entry) => entry.id === provider)!.models
    .some((model) => model.id === value)
}
```

Implement settings normalization before caching and persist `{ provider, models }`. Add `provider` to `AppConfig`, replace the global `MODELS` export with the shared catalog, and add the `renderer:set-provider` channel.

- [ ] **Step 4: Run focused and existing tests**

Run: `./node_modules/.bin/vitest run tests/settings.test.ts tests/claude.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the provider catalog and migration**

```bash
git add src/shared/providers.ts src/shared/ipc.ts src/main/settings.ts tests/settings.test.ts
git commit -m "feat: add provider-aware settings"
```

### Task 2: Codex CLI provider

**Files:**
- Create: `src/main/provider-types.ts`
- Create: `src/main/openai.ts`
- Modify: `src/main/claude.ts`
- Test: `tests/openai.test.ts`
- Modify: `tests/claude.test.ts`

**Interfaces:**
- Produces: `ProviderAskOptions`, `ProviderAvailability`, `AiProvider`.
- Produces: `resolveCodex()`, `buildCodexArgs()`, and `askOpenAI()`.
- Consumes: provider model values from `src/shared/providers.ts`.

- [ ] **Step 1: Write failing argument, stream, and error tests**

```ts
expect(buildCodexArgs({ prompt: 'Explain this', imagePath: '/tmp/screen.png', model: '' }))
  .toEqual([
    'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--ignore-rules', '--ignore-user-config', '--json',
    '--image', '/tmp/screen.png', 'Explain this'
  ])

it('emits completed agent messages from Codex JSONL', async () => {
  const line = JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', text: 'Answer from ChatGPT' }
  })
  const result = await collectOpenAI(fakeSpawn([line], 0))
  expect(result).toEqual({ chunks: ['Answer from ChatGPT'], done: true })
})

it('turns signed-out failures into a codex login instruction', async () => {
  const result = await collectOpenAI(fakeSpawn([], 1, 'Not logged in'))
  expect(result.error).toContain('codex login')
})
```

- [ ] **Step 2: Verify the new tests fail**

Run: `./node_modules/.bin/vitest run tests/openai.test.ts`

Expected: FAIL because `openai.ts` does not exist.

- [ ] **Step 3: Define the provider boundary and implement Codex discovery**

```ts
export interface ProviderAskOptions {
  prompt: string
  imagePath?: string
  model?: string
  onChunk(text: string): void
  onDone(): void
  onError(message: string): void
  onLog?(level: LogLevel, message: string, extra?: unknown): void
  spawnFn?: typeof spawn
}

export interface ProviderAvailability {
  bin: string
  pathEnv: string
  found: boolean
  setupCommand: string
}
```

Resolve `/Applications/ChatGPT.app/Contents/Resources/codex`, Homebrew paths, `~/.local/bin/codex`, and inherited PATH. Spawn from `mkdtemp(join(tmpdir(), 'ghostpane-codex-'))`, parse JSONL one line at a time, emit only `item.completed` agent messages, and remove the empty working directory after process termination.

- [ ] **Step 4: Adapt Claude to the common option type**

Keep `ask()` as a compatibility export while making it satisfy `AiProvider`. Preserve the existing partial-delta de-duplication tests unchanged.

- [ ] **Step 5: Run provider tests and type checking**

Run: `./node_modules/.bin/vitest run tests/openai.test.ts tests/claude.test.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`

Expected: all provider tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the provider adapters**

```bash
git add src/main/provider-types.ts src/main/openai.ts src/main/claude.ts tests/openai.test.ts tests/claude.test.ts
git commit -m "feat: add ChatGPT Codex provider"
```

### Task 3: Owned temporary-file cleanup

**Files:**
- Create: `src/main/owned-paths.ts`
- Test: `tests/owned-paths.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `OwnedPaths.add(path)`, `OwnedPaths.release(path)`, `OwnedPaths.cleanup()`.
- Consumes: screenshot paths returned by `captureBehindOverlay()`.

- [ ] **Step 1: Write failing idempotent-cleanup tests**

```ts
it('unlinks each owned path exactly once even when cleanup repeats', async () => {
  const unlink = vi.fn().mockResolvedValue(undefined)
  const owned = new OwnedPaths(unlink)
  owned.add('/tmp/a.png')
  await owned.cleanup()
  await owned.cleanup()
  expect(unlink).toHaveBeenCalledTimes(1)
})

it('continues cleanup after one unlink fails', async () => {
  const unlink = vi.fn()
    .mockRejectedValueOnce(new Error('busy'))
    .mockResolvedValueOnce(undefined)
  const owned = new OwnedPaths(unlink)
  owned.add('/tmp/a.png'); owned.add('/tmp/b.png')
  await owned.cleanup()
  expect(unlink).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Verify failure**

Run: `./node_modules/.bin/vitest run tests/owned-paths.test.ts`

Expected: FAIL because `OwnedPaths` is undefined.

- [ ] **Step 3: Implement ownership and integrate it into request termination**

```ts
export class OwnedPaths {
  private readonly paths = new Set<string>()
  constructor(private readonly unlinkPath = unlink) {}
  add(path: string): string { this.paths.add(path); return path }
  release(path: string): void { this.paths.delete(path) }
  async cleanup(): Promise<void> {
    const pending = [...this.paths]
    this.paths.clear()
    await Promise.allSettled(pending.map((path) => this.unlinkPath(path)))
  }
}
```

Create one owner per ask. Add the screenshot immediately after capture. Invoke cleanup from provider `onDone`, provider `onError`, synchronous spawn failures, screenshot errors, and app shutdown. Do not log screenshot contents.

- [ ] **Step 4: Run cleanup and existing request tests**

Run: `./node_modules/.bin/vitest run tests/owned-paths.test.ts tests/claude.test.ts tests/crop.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit cleanup**

```bash
git add src/main/owned-paths.ts src/main/index.ts tests/owned-paths.test.ts
git commit -m "fix: delete temporary screenshots after asks"
```

### Task 4: IPC and navigation trust boundary

**Files:**
- Create: `src/main/ipc-validation.ts`
- Create: `src/main/navigation.ts`
- Modify: `src/main/overlay-window.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/ipc-validation.test.ts`
- Test: `tests/navigation.test.ts`

**Interfaces:**
- Produces: `isTrustedSender(event, win, rendererUrl)`, `parseAskRequest()`, `parseResize()`, `parseProvider()`, `parseModel()`.
- Produces: `isExternalHttpsUrl()`, `installNavigationGuards()`.

- [ ] **Step 1: Write failing validation and URL tests**

```ts
expect(parseAskRequest({ prompt: 'hello', withScreenshot: true }))
  .toEqual({ prompt: 'hello', withScreenshot: true })
expect(parseAskRequest({ prompt: 4, withScreenshot: true })).toBeNull()
expect(parseAskRequest({ prompt: 'x'.repeat(20_001), withScreenshot: false })).toBeNull()
expect(isExternalHttpsUrl('https://example.com/path')).toBe(true)
expect(isExternalHttpsUrl('javascript:alert(1)')).toBe(false)
expect(isExternalHttpsUrl('file:///etc/passwd')).toBe(false)
```

- [ ] **Step 2: Verify tests fail**

Run: `./node_modules/.bin/vitest run tests/ipc-validation.test.ts tests/navigation.test.ts`

Expected: FAIL because the validation modules do not exist.

- [ ] **Step 3: Implement pure validators**

Bound prompts to 20,000 UTF-16 code units, require literal booleans, require finite resize numbers, and validate provider/model pairs through the shared catalog. Sender trust requires `event.sender === win.webContents`, `event.senderFrame === win.webContents.mainFrame`, and a normalized frame URL equal to the packaged renderer URL or development renderer origin.

- [ ] **Step 4: Install defense-in-depth navigation guards**

```ts
win.webContents.on('will-navigate', (event, url) => {
  if (url !== trustedRendererUrl) event.preventDefault()
})
win.webContents.setWindowOpenHandler(({ url }) => {
  if (isExternalHttpsUrl(url)) void shell.openExternal(url)
  return { action: 'deny' }
})
```

Add `openExternal(url)` to preload as a send-only channel. Main validates `https:` before calling `shell.openExternal`. Replace every unvalidated IPC listener with a trusted-sender check followed by a pure payload parser.

- [ ] **Step 5: Run focused tests and type checking**

Run: `./node_modules/.bin/vitest run tests/ipc-validation.test.ts tests/navigation.test.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`

Expected: PASS.

- [ ] **Step 6: Commit the trust-boundary hardening**

```bash
git add src/main/ipc-validation.ts src/main/navigation.ts src/main/overlay-window.ts src/main/index.ts src/preload/index.ts tests/ipc-validation.test.ts tests/navigation.test.ts
git commit -m "fix: harden renderer navigation and IPC"
```

### Task 5: Provider UI and main-process routing

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/ghost.d.ts`
- Test: `tests/provider-routing.test.ts`

**Interfaces:**
- Consumes: provider catalog, settings configuration, `askOpenAI()`, and Claude `ask()`.
- Produces: visible provider selector and provider-specific model selector.

- [ ] **Step 1: Write a failing provider-router unit test**

```ts
it('routes the first-run OpenAI provider without falling back to Claude', () => {
  const openai = vi.fn()
  const claude = vi.fn()
  routeAsk('openai', { openai, claude }, options)
  expect(openai).toHaveBeenCalledWith(options)
  expect(claude).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Verify failure**

Run: `./node_modules/.bin/vitest run tests/provider-routing.test.ts`

Expected: FAIL because `routeAsk` does not exist.

- [ ] **Step 3: Implement routing and provider-aware UI**

Add a pure `routeAsk()` map lookup with no fallback. Push `{ provider, model, logPath }` to the renderer. Render provider and model selectors from `PROVIDERS`; invoke `window.ghost.setProvider()` and `setModel()` independently. Render Markdown anchors as:

```tsx
<Markdown components={{
  a: ({ href, children }) => (
    <a href="#" onClick={(event) => {
      event.preventDefault()
      if (href) window.ghost.openExternal(href)
    }}>{children}</a>
  )
}}>{answer}</Markdown>
```

Add `.provider` to the existing no-drag control list and reuse the compact select styling.

- [ ] **Step 4: Run the full TypeScript verification suite**

Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && ./node_modules/.bin/electron-vite build`

Expected: all tests PASS, type checking exits 0, and main/preload/renderer production bundles build.

- [ ] **Step 5: Commit provider routing and UI**

```bash
git add src/renderer/App.tsx src/renderer/styles.css src/main/index.ts src/renderer/ghost.d.ts tests/provider-routing.test.ts
git commit -m "feat: make ChatGPT the default provider"
```
