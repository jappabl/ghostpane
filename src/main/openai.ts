import { spawn as realSpawn } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import type { ProviderAskOptions, ProviderAvailability } from './provider-types'
import { withResponseGuidance } from './response-guidance'

const EXTRA_DIRS = [
  '/Applications/ChatGPT.app/Contents/Resources',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.npm-global', 'bin'),
  join(homedir(), 'bin')
]

export interface OpenAIAskOptions extends ProviderAskOptions {
  codexBin?: string
  cwd?: string
}

export function resolveCodex(): ProviderAvailability {
  const pathEnv = [...EXTRA_DIRS, process.env.PATH || ''].filter(Boolean).join(':')
  for (const dir of EXTRA_DIRS) {
    const candidate = join(dir, 'codex')
    if (existsSync(candidate)) {
      return { bin: candidate, pathEnv, found: true, setupCommand: 'codex login' }
    }
  }
  return { bin: 'codex', pathEnv, found: false, setupCommand: 'codex login' }
}

export function buildCodexArgs(input: Pick<OpenAIAskOptions, 'prompt' | 'imagePath' | 'model'>): string[] {
  const args = [
    'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--ignore-rules', '--ignore-user-config', '--json'
  ]
  if (input.model) args.push('--model', input.model)
  if (input.imagePath) args.push('--image', input.imagePath)
  args.push('--', withResponseGuidance(input.prompt))
  return args
}

function friendlyError(stderr: string, code: number): string {
  const detail = stderr.trim()
  if (/not logged in|login|authentication|unauthorized|401/i.test(detail)) {
    return 'ChatGPT is not signed in. Run `codex login` in Terminal, then try again.'
  }
  return detail || `Codex exited with code ${code}. Run \`codex login\` if your ChatGPT session expired.`
}

export function askOpenAI(options: OpenAIAskOptions): void {
  const spawnFn = options.spawnFn ?? realSpawn
  const resolved = options.codexBin
    ? { bin: options.codexBin, pathEnv: options.pathEnv ?? process.env.PATH ?? '' }
    : resolveCodex()
  const ownedCwd = options.cwd ? null : mkdtempSync(join(tmpdir(), 'ghostpane-codex-'))
  const cwd = options.cwd ?? ownedCwd!
  const logIt = options.onLog ?? (() => {})
  let child
  let finished = false
  let buffer = ''
  let stderr = ''

  const cleanup = () => {
    if (ownedCwd) {
      try { rmSync(ownedCwd, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  }
  const finishOnce = (callback: () => void) => {
    if (finished) return
    finished = true
    cleanup()
    callback()
  }

  try {
    child = spawnFn(resolved.bin, buildCodexArgs(options), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: resolved.pathEnv }
    })
  } catch (error) {
    cleanup()
    options.onError((error as Error).message)
    return
  }

  logIt('info', 'spawning codex', {
    bin: resolved.bin,
    model: options.model || '(default)',
    withImage: Boolean(options.imagePath)
  })

  child.on('error', (error: NodeJS.ErrnoException) => {
    const message = error.code === 'ENOENT'
      ? 'Codex CLI not found. Install Codex, run `codex login`, then reopen Ghostpane.'
      : error.message
    logIt('error', 'codex process error', { code: error.code, message: error.message })
    finishOnce(() => options.onError(message))
  })
  child.stderr?.on('data', (data) => { stderr += data.toString() })
  child.stdout?.on('data', (data) => {
    buffer += data.toString()
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'item.completed' &&
            event.item?.type === 'agent_message' &&
            typeof event.item.text === 'string' && event.item.text) {
          options.onChunk(event.item.text)
        }
      } catch {
        logIt('warn', 'ignoring invalid codex JSONL')
      }
    }
  })
  child.on('close', (code: number) => {
    logIt(code === 0 ? 'info' : 'error', 'codex exited', {
      code, stderr: stderr.trim().slice(0, 800)
    })
    if (code === 0) finishOnce(options.onDone)
    else finishOnce(() => options.onError(friendlyError(stderr, code)))
  })
}
