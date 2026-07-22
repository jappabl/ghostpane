import { spawn as realSpawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// GUI apps launched from Finder/.dmg get a bare PATH (/usr/bin:/bin:...) that
// omits Homebrew and other common install dirs, so `claude` isn't found. Resolve
// the binary from known locations and augment PATH for the spawned process.
const EXTRA_DIRS = [
  '/opt/homebrew/bin', '/usr/local/bin',
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.claude', 'local'),
  join(homedir(), '.bun', 'bin'),
  join(homedir(), 'bin')
]

export function resolveClaude(): { bin: string; pathEnv: string; found: boolean } {
  const pathEnv = [...EXTRA_DIRS, process.env.PATH || ''].filter(Boolean).join(':')
  for (const dir of EXTRA_DIRS) {
    const p = join(dir, 'claude')
    if (existsSync(p)) return { bin: p, pathEnv, found: true }
  }
  return { bin: 'claude', pathEnv, found: false } // fall back to PATH lookup
}

// Tunes Claude's output for a small, always-on-top overlay: fast, dense,
// answer-first, and formatted to render well in a narrow markdown panel.
export const SYSTEM_PROMPT = [
  'You are a heads-up assistant shown in a small, always-on-top overlay window',
  'that floats over whatever the user is doing. Optimize for glanceability.',
  'Rules:',
  '- Answer immediately. No preamble, no "Sure", no restating the question, no sign-off.',
  '- Lead with the direct answer or the code, then (optionally) a 1–2 line why.',
  '- Be concise. Short sentences and tight bullet lists beat paragraphs.',
  '- The window is narrow (~500px). Keep lines short; never draw wide ASCII tables.',
  '- Use Markdown: fenced code blocks with a language tag for any code.',
  '- For a coding/interview problem on screen: give the complete, correct solution',
  '  first (in a code block), then one line on approach and time/space complexity.',
  '- If the screenshot is ambiguous, state your single best interpretation and answer it;',
  '  do not ask clarifying questions — the user usually cannot type a reply quickly.'
].join('\n')

export class ClaudeUnavailable extends Error {}

export interface AskOptions {
  prompt: string
  imagePath?: string
  model?: string // '' or undefined = subscription default
  onChunk: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
  onLog?: (level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) => void
  spawnFn?: typeof realSpawn
  claudeBin?: string
  pathEnv?: string
}

export function ask(opts: AskOptions): void {
  const spawnFn = opts.spawnFn ?? realSpawn
  const resolved = opts.claudeBin ? { bin: opts.claudeBin, pathEnv: opts.pathEnv ?? process.env.PATH ?? '' } : resolveClaude()
  const bin = resolved.bin
  const logIt = opts.onLog ?? (() => {})
  const prompt = opts.imagePath
    ? `${opts.prompt}\n\n[Screenshot saved at: ${opts.imagePath}] Read the image file at that path and answer.`
    : opts.prompt

  const args = [
    '-p', prompt,
    '--append-system-prompt', SYSTEM_PROMPT,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages'
  ]
  if (opts.model) args.push('--model', opts.model)

  logIt('info', 'spawning claude', { bin, model: opts.model || '(default)', withImage: Boolean(opts.imagePath) })
  let child
  try {
    child = spawnFn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: resolved.pathEnv }
    })
  } catch (e) {
    logIt('error', 'spawn threw', e)
    opts.onError((e as Error).message)
    return
  }

  let buf = ''
  let stderr = ''
  let done = false
  let sawDelta = false
  const finishOnce = (fn: () => void) => { if (!done) { done = true; fn() } }

  child.on('error', (e: NodeJS.ErrnoException) => {
    const msg = e.code === 'ENOENT'
      ? 'Claude Code CLI not found. Install it (https://claude.ai/install.sh) and run `claude login` in Terminal, then reopen Ghostpane.'
      : e.message
    logIt('error', 'claude process error', { code: e.code, message: e.message })
    finishOnce(() => opts.onError(msg))
  })

  child.stderr?.on('data', (d) => { stderr += d.toString() })

  child.stdout?.on('data', (d) => {
    buf += d.toString()
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let obj: any
      try { obj = JSON.parse(line) } catch { continue }
      // Live token deltas (when --include-partial-messages is honored).
      if (obj.type === 'stream_event' && obj.event?.type === 'content_block_delta') {
        const delta = obj.event.delta
        if (delta?.type === 'text_delta' && delta.text) {
          sawDelta = true
          opts.onChunk(delta.text)
        }
        continue
      }
      // Full assistant message — only emit if we never saw streaming deltas,
      // otherwise it would duplicate the already-streamed text.
      if (obj.type === 'assistant' && obj.message?.content && !sawDelta) {
        for (const block of obj.message.content) {
          if (block.type === 'text' && block.text) opts.onChunk(block.text)
        }
      }
    }
  })

  child.on('close', (code: number) => {
    logIt(code === 0 ? 'info' : 'error', 'claude exited', { code, stderr: stderr.trim().slice(0, 800) })
    if (code === 0) finishOnce(opts.onDone)
    else finishOnce(() => opts.onError(stderr.trim() || `claude exited with code ${code}`))
  })
}
