import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'events'
import { ask } from '../src/main/claude'

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
