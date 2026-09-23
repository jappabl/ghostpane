import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { ask, SYSTEM_PROMPT } from '../src/main/claude'
import { MATH_FORMATTING_GUIDANCE } from '../src/main/response-guidance'

function fakeSpawn(lines: string[], exitCode = 0) {
  return () => {
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setTimeout(() => {
      for (const l of lines) child.stdout.emit('data', Buffer.from(l + '\n'))
      child.emit('close', exitCode)
    }, 0)
    return child
  }
}

describe('ask', () => {
  it('requests canonical inline and display math delimiters', () => {
    expect(SYSTEM_PROMPT).toContain(MATH_FORMATTING_GUIDANCE)
    expect(SYSTEM_PROMPT).toContain('Use `$...$` for inline math')
    expect(SYSTEM_PROMPT).toContain('Use `$$...$$` for display math')
  })

  it('streams assistant text chunks then done', async () => {
    const chunks: string[] = []
    const lines = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: ' world' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success' })
    ]
    await new Promise<void>((resolve) => {
      ask({
        prompt: 'hi', onChunk: (t) => chunks.push(t),
        onDone: () => resolve(), onError: () => resolve(),
        spawnFn: fakeSpawn(lines) as any
      })
    })
    expect(chunks.join('')).toBe('Hello world')
  })

  it('streams partial text_delta events and does not duplicate the final assistant message', async () => {
    const chunks: string[] = []
    const lines = [
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'One' } } }),
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' two' } } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'One two' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success' })
    ]
    await new Promise<void>((resolve) => {
      ask({
        prompt: 'hi', onChunk: (t) => chunks.push(t),
        onDone: () => resolve(), onError: () => resolve(),
        spawnFn: fakeSpawn(lines) as any
      })
    })
    // 'One' + ' two' from deltas only — the full assistant message is suppressed.
    expect(chunks.join('')).toBe('One two')
    expect(chunks.length).toBe(2)
  })

  it('reports error on non-zero exit', async () => {
    const msg = await new Promise<string>((resolve) => {
      ask({
        prompt: 'hi', onChunk: () => {}, onDone: () => resolve('DONE-unexpected'),
        onError: (m) => resolve(m), spawnFn: fakeSpawn(['garbage'], 1) as any
      })
    })
    expect(msg).not.toBe('DONE-unexpected')
  })
})

function spawnWith(opts: { stdout?: string[]; stderr?: string; exitCode?: number; hang?: boolean; kill?: () => void }) {
  return () => {
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = opts.kill ?? (() => {})
    setTimeout(() => {
      if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr))
      for (const chunk of opts.stdout ?? []) child.stdout.emit('data', Buffer.from(chunk))
      if (!opts.hang) child.emit('close', opts.exitCode ?? 0)
    }, 0)
    return child
  }
}

describe('ask resource bounds', () => {
  it('bounds retained stderr so a chatty claude cannot grow the heap without limit', async () => {
    const error = await new Promise<string>((resolve) => {
      ask({
        prompt: 'hi', onChunk: () => {}, onDone: () => resolve('(done)'), onError: resolve,
        spawnFn: spawnWith({ stderr: 'warning line\n'.repeat(60_000), exitCode: 1 }) as any
      })
    })
    expect(error.length).toBeLessThanOrEqual(8192)
  })

  it('discards an oversized unterminated line instead of buffering it forever', async () => {
    const good = JSON.stringify({
      type: 'assistant', message: { content: [{ type: 'text', text: 'recovered' }] }
    })
    const chunks: string[] = []
    const logs: string[] = []
    await new Promise<void>((resolve) => {
      ask({
        prompt: 'hi',
        onChunk: (t) => chunks.push(t),
        onDone: () => resolve(),
        onError: () => resolve(),
        onLog: (_level, message) => logs.push(message),
        spawnFn: spawnWith({ stdout: ['y'.repeat(1_500_000), '\n' + good + '\n'] }) as any
      })
    })
    expect(logs.some((m) => /oversized/i.test(m))).toBe(true)
    expect(chunks).toEqual(['recovered'])
  })

  it('kills a claude process that never exits and surfaces the timeout', async () => {
    const kill = vi.fn()
    const error = await new Promise<string>((resolve) => {
      ask({
        prompt: 'hi', onChunk: () => {}, onDone: () => resolve('(done)'), onError: resolve,
        timeoutMs: 20,
        spawnFn: spawnWith({ hang: true, kill }) as any
      })
    })
    expect(error).toMatch(/timed out/i)
    expect(kill).toHaveBeenCalled()
  })

  it('does not time out a process that finishes in time', async () => {
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'fast' }] } })
    const done = await new Promise<boolean>((resolve) => {
      ask({
        prompt: 'hi', onChunk: () => {}, onDone: () => resolve(true), onError: () => resolve(false),
        timeoutMs: 5000,
        spawnFn: spawnWith({ stdout: [line + '\n'] }) as any
      })
    })
    expect(done).toBe(true)
  })
})
