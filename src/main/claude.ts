import { spawn as realSpawn } from 'child_process'

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
  onChunk: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
  spawnFn?: typeof realSpawn
  claudeBin?: string
}

export function ask(opts: AskOptions): void {
  const spawnFn = opts.spawnFn ?? realSpawn
  const bin = opts.claudeBin ?? 'claude'
  const prompt = opts.imagePath
    ? `${opts.prompt}\n\n[Screenshot saved at: ${opts.imagePath}] Read the image file at that path and answer.`
    : opts.prompt

  const args = [
    '-p', prompt,
    '--append-system-prompt', SYSTEM_PROMPT,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages'
  ]
  let child
  try {
    child = spawnFn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
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
      ? 'Claude Code CLI not found on PATH. Install it and run `claude login`.'
      : e.message
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
    if (code === 0) finishOnce(opts.onDone)
    else finishOnce(() => opts.onError(stderr.trim() || `claude exited with code ${code}`))
  })
}
