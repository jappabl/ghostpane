import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { askOpenAI, buildCodexArgs } from '../src/main/openai'
import { withResponseGuidance } from '../src/main/response-guidance'

function fakeSpawn(lines: string[], exitCode = 0, stderrText = '') {
  return () => {
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setTimeout(() => {
      if (stderrText) child.stderr.emit('data', Buffer.from(stderrText))
      for (const line of lines) child.stdout.emit('data', Buffer.from(line + '\n'))
      child.emit('close', exitCode)
    }, 0)
    return child
  }
}

async function collect(lines: string[], exitCode = 0, stderr = '') {
  const chunks: string[] = []
  return await new Promise<{ chunks: string[]; done: boolean; error: string }>((resolve) => {
    askOpenAI({
      prompt: 'Explain this',
      onChunk: (text) => chunks.push(text),
      onDone: () => resolve({ chunks, done: true, error: '' }),
      onError: (error) => resolve({ chunks, done: false, error }),
      spawnFn: fakeSpawn(lines, exitCode, stderr) as any,
      codexBin: '/mock/codex',
      pathEnv: '/mock/bin',
      cwd: '/tmp'
    })
  })
}

describe('buildCodexArgs', () => {
  it('builds an isolated image request using the subscription default model', () => {
    expect(buildCodexArgs({
      prompt: 'Explain this', imagePath: '/tmp/screen.png', model: ''
    })).toEqual([
      'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
      '--ignore-rules', '--ignore-user-config', '--json',
      '--image', '/tmp/screen.png', '--', withResponseGuidance('Explain this')
    ])
  })

  it('adds an explicitly selected model', () => {
    expect(buildCodexArgs({ prompt: 'Hi', model: 'gpt-5.6-sol' }))
      .toContain('gpt-5.6-sol')
  })

  it('places the original request after shared math guidance', () => {
    const prompt = withResponseGuidance('Explain this')
    expect(prompt).toContain('Use `$...$` for inline math')
    expect(prompt).toContain('Use `$$...$$` for display math')
    expect(prompt).toContain('User request:\nExplain this')
  })
})

describe('askOpenAI', () => {
  it('emits completed agent messages from Codex JSONL', async () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Answer from ChatGPT' }
    })
    expect(await collect([line])).toEqual({
      chunks: ['Answer from ChatGPT'], done: true, error: ''
    })
  })

  it('buffers split JSONL lines', async () => {
    const event = JSON.stringify({
      type: 'item.completed', item: { type: 'agent_message', text: 'split' }
    })
    const spawn = () => {
      const child: any = new EventEmitter()
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from(event.slice(0, 18)))
        child.stdout.emit('data', Buffer.from(event.slice(18) + '\n'))
        child.emit('close', 0)
      }, 0)
      return child
    }
    const chunks: string[] = []
    await new Promise<void>((resolve) => askOpenAI({
      prompt: 'Hi', onChunk: (text) => chunks.push(text), onDone: resolve,
      onError: () => resolve(), spawnFn: spawn as any, codexBin: '/mock/codex', cwd: '/tmp'
    }))
    expect(chunks).toEqual(['split'])
  })

  it('turns signed-out failures into a codex login instruction', async () => {
    const result = await collect([], 1, 'Not logged in')
    expect(result.error).toContain('codex login')
  })
})

// A codex process that produces output but never exits.
function hangingSpawn(kill: () => void, stdoutChunks: string[] = []) {
  return () => {
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = kill
    setTimeout(() => {
      for (const chunk of stdoutChunks) child.stdout.emit('data', Buffer.from(chunk))
    }, 0)
    return child
  }
}

describe('askOpenAI resource bounds', () => {
  it('bounds retained stderr so a chatty codex cannot grow the heap without limit', async () => {
    const noisy = 'codex progress line\n'.repeat(40_000) // ~800KB
    const result = await collect([], 1, noisy)
    expect(result.error.length).toBeLessThanOrEqual(8192)
  })

  it('keeps the end of stderr, where the actual failure is reported', async () => {
    const noisy = 'progress\n'.repeat(40_000) + 'ERROR: not logged in'
    const result = await collect([], 1, noisy)
    expect(result.error).toContain('Run `codex login`')
  })

  it('discards an oversized unterminated line instead of buffering it forever', async () => {
    const good = JSON.stringify({
      type: 'item.completed', item: { type: 'agent_message', text: 'recovered' }
    })
    const chunks: string[] = []
    const logs: string[] = []
    await new Promise<void>((resolve) => {
      askOpenAI({
        prompt: 'x',
        onChunk: (t) => chunks.push(t),
        onDone: () => resolve(),
        onError: () => resolve(),
        onLog: (_level, message) => logs.push(message),
        spawnFn: (() => {
          const child: any = new EventEmitter()
          child.stdout = new EventEmitter()
          child.stderr = new EventEmitter()
          setTimeout(() => {
            // 1.5MB with no newline: today this sits in the line buffer forever.
            child.stdout.emit('data', Buffer.from('x'.repeat(1_500_000)))
            child.stdout.emit('data', Buffer.from('\n' + good + '\n'))
            child.emit('close', 0)
          }, 0)
          return child
        }) as any,
        codexBin: '/mock/codex', pathEnv: '/mock/bin', cwd: '/tmp'
      })
    })
    expect(logs.some((m) => /oversized/i.test(m))).toBe(true)
    // ...and the stream still recovers on the next well-formed line.
    expect(chunks).toEqual(['recovered'])
  })

  it('kills a codex process that never exits and surfaces the timeout', async () => {
    const kill = vi.fn()
    const error = await new Promise<string>((resolve) => {
      askOpenAI({
        prompt: 'x',
        onChunk: () => {},
        onDone: () => resolve('(done)'),
        onError: resolve,
        timeoutMs: 20,
        spawnFn: hangingSpawn(kill) as any,
        codexBin: '/mock/codex', pathEnv: '/mock/bin', cwd: '/tmp'
      })
    })
    expect(error).toMatch(/timed out/i)
    expect(kill).toHaveBeenCalled()
  })

  it('does not time out a process that finishes in time', async () => {
    const line = JSON.stringify({
      type: 'item.completed', item: { type: 'agent_message', text: 'fast' }
    })
    const result = await new Promise<{ chunks: string[]; done: boolean; error: string }>((resolve) => {
      askOpenAI({
        prompt: 'x',
        onChunk: () => {},
        onDone: () => resolve({ chunks: [], done: true, error: '' }),
        onError: (e) => resolve({ chunks: [], done: false, error: e }),
        timeoutMs: 5000,
        spawnFn: fakeSpawn([line], 0) as any,
        codexBin: '/mock/codex', pathEnv: '/mock/bin', cwd: '/tmp'
      })
    })
    expect(result.done).toBe(true)
  })
})
