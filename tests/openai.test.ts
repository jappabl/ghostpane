import { EventEmitter } from 'events'
import { describe, expect, it } from 'vitest'
import { askOpenAI, buildCodexArgs } from '../src/main/openai'

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
      '--image', '/tmp/screen.png', 'Explain this'
    ])
  })

  it('adds an explicitly selected model', () => {
    expect(buildCodexArgs({ prompt: 'Hi', model: 'gpt-5.6-sol' }))
      .toContain('gpt-5.6-sol')
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
