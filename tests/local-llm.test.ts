import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  askLocal,
  discoverLocalServer,
  localModelOptions,
  looksVisionCapable,
  parseModelList,
  pickModel,
  type LocalAskOptions,
  type LocalServer
} from '../src/main/local-llm'

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void
const open: Server[] = []

async function fakeServer(handler: Handler, port = 0): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (d) => { body += d })
    req.on('end', () => handler(req, body, res))
  })
  open.push(server)
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise<void>((resolve) => {
    s.closeAllConnections()
    s.close(() => resolve())
  })))
})

// Nothing listens on port 1, so a probe there is refused immediately.
const CLOSED: LocalServer = { name: 'Nothing', baseUrl: 'http://127.0.0.1:1' }

function models(...ids: string[]) {
  return JSON.stringify({ object: 'list', data: ids.map((id) => ({ id, object: 'model' })) })
}

function sse(res: ServerResponse, deltas: string[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const content of deltas) {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`)
  }
  res.end('data: [DONE]\n\n')
}

// An OpenAI-compatible server: lists models and streams a fixed answer.
function openAiServer(ids: string[], deltas: string[], seen?: { body?: any }): Handler {
  return (req, body, res) => {
    if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(models(...ids)); return }
    if (req.url === '/v1/chat/completions') { if (seen) seen.body = JSON.parse(body); sse(res, deltas); return }
    res.writeHead(404); res.end()
  }
}

function run(opts: Partial<LocalAskOptions>) {
  const chunks: string[] = []
  return new Promise<{ chunks: string[]; done: boolean; error: string }>((resolve) => {
    askLocal({
      prompt: 'What is 2+2?',
      onChunk: (t) => chunks.push(t),
      onDone: () => resolve({ chunks, done: true, error: '' }),
      onError: (error) => resolve({ chunks, done: false, error }),
      ...opts
    })
  })
}

describe('parseModelList', () => {
  it('reads model ids from an OpenAI-style list', () => {
    expect(parseModelList({ data: [{ id: 'llama3.2' }, { id: 'qwen2.5:7b' }] })).toEqual(['llama3.2', 'qwen2.5:7b'])
  })

  it('drops embedding models, which cannot answer a question', () => {
    expect(parseModelList({ data: [{ id: 'nomic-embed-text' }, { id: 'text-embedding-3' }, { id: 'mistral' }] }))
      .toEqual(['mistral'])
  })

  it('rejects a response that is not a model list', () => {
    expect(parseModelList({ hello: 'world' })).toBeNull()
    expect(parseModelList('<html>')).toBeNull()
  })
})

describe('discoverLocalServer', () => {
  it('finds a running server and its models', async () => {
    const url = await fakeServer(openAiServer(['mistral'], []))
    expect(await discoverLocalServer({ servers: [CLOSED, { name: 'LM Studio', baseUrl: url }] }))
      .toEqual({ name: 'LM Studio', baseUrl: url, models: ['mistral'] })
  })

  it('returns null when nothing is running', async () => {
    expect(await discoverLocalServer({ servers: [CLOSED] })).toBeNull()
  })

  it('ignores an unrelated web server on a shared port', async () => {
    const url = await fakeServer((_req, _body, res) => { res.writeHead(404); res.end('Not Found') })
    expect(await discoverLocalServer({ servers: [{ name: 'llama.cpp', baseUrl: url }] })).toBeNull()
  })

  it('prefers the first server in priority order when several are running', async () => {
    const first = await fakeServer(openAiServer(['a'], []))
    const second = await fakeServer(openAiServer(['b'], []))
    const found = await discoverLocalServer({
      servers: [{ name: 'Ollama', baseUrl: first }, { name: 'LM Studio', baseUrl: second }]
    })
    expect(found?.name).toBe('Ollama')
  })

  it('prefers a server that has models over one that has none', async () => {
    const empty = await fakeServer(openAiServer([], []))
    const stocked = await fakeServer(openAiServer(['phi'], []))
    const found = await discoverLocalServer({
      servers: [{ name: 'Ollama', baseUrl: empty }, { name: 'LM Studio', baseUrl: stocked }]
    })
    expect(found?.name).toBe('LM Studio')
  })
})

describe('looksVisionCapable', () => {
  it('recognises common vision model families', () => {
    for (const id of ['llava:7b', 'qwen2.5vl:3b', 'gemma3:4b', 'llama3.2-vision', 'minicpm-v', 'moondream', 'qwen/qwen3-vl-8b', 'pixtral-12b']) {
      expect(looksVisionCapable(id), id).toBe(true)
    }
  })

  it('does not flag text-only models', () => {
    for (const id of ['llama3.1:8b', 'qwen2.5:7b', 'mistral', 'phi3.5', 'deepseek-r1:8b', 'gemma2:9b']) {
      expect(looksVisionCapable(id), id).toBe(false)
    }
  })
})

describe('pickModel', () => {
  it('uses the model the user chose when it is still installed', () => {
    expect(pickModel(['a', 'b'], 'b', false)).toBe('b')
  })

  it('falls back to automatic choice when the chosen model was removed', () => {
    expect(pickModel(['a', 'b'], 'gone', false)).toBe('a')
  })

  it('picks a model that can see when a screenshot is attached', () => {
    expect(pickModel(['llama3.1', 'llava:7b'], '', true)).toBe('llava:7b')
  })

  it('still answers with a text model when no vision model exists', () => {
    expect(pickModel(['llama3.1'], '', true)).toBe('llama3.1')
  })

  it('returns null when there are no models at all', () => {
    expect(pickModel([], '', false)).toBeNull()
  })
})

describe('askLocal', () => {
  it('streams the answer from whatever local server is running', async () => {
    const url = await fakeServer(openAiServer(['mistral'], ['Four', '.']))
    expect(await run({ servers: [CLOSED, { name: 'Ollama', baseUrl: url }] }))
      .toEqual({ chunks: ['Four', '.'], done: true, error: '' })
  })

  it('sends the overlay system prompt, the question and the picked model', async () => {
    const seen: { body?: any } = {}
    const url = await fakeServer(openAiServer(['mistral'], ['ok'], seen))
    await run({ servers: [{ name: 'Ollama', baseUrl: url }] })
    expect(seen.body.model).toBe('mistral')
    expect(seen.body.stream).toBe(true)
    expect(seen.body.messages[0].role).toBe('system')
    expect(JSON.stringify(seen.body.messages[1])).toContain('What is 2+2?')
  })

  it('attaches the screenshot as an image and routes it to a vision model', async () => {
    const seen: { body?: any } = {}
    const url = await fakeServer(openAiServer(['llama3.1', 'llava:7b'], ['I see code'], seen))
    const result = await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: '/tmp/screen.png',
      imageDataUrl: async () => 'data:image/jpeg;base64,QUJD'
    })
    expect(result.done).toBe(true)
    expect(seen.body.model).toBe('llava:7b')
    expect(seen.body.messages[1].content).toContainEqual({
      type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' }
    })
  })

  it('tells the user how to get started when no local server exists', async () => {
    const result = await run({ servers: [CLOSED] })
    expect(result.done).toBe(false)
    expect(result.error).toMatch(/Ollama|LM Studio/)
  })

  it('starts an installed runtime and connects once it is up', async () => {
    const port = await freePort()
    let started = false
    const result = await run({
      servers: [{ name: 'Ollama', baseUrl: `http://127.0.0.1:${port}` }],
      startServer: async () => {
        started = true
        setTimeout(() => { void fakeServer(openAiServer(['mistral'], ['up']), port) }, 150)
        return 'Ollama'
      },
      startWaitMs: 5000
    })
    expect(started).toBe(true)
    expect(result).toEqual({ chunks: ['up'], done: true, error: '' })
  })

  it('says how to add a model when the server has none', async () => {
    const url = await fakeServer(openAiServer([], []))
    const result = await run({ servers: [{ name: 'Ollama', baseUrl: url }] })
    expect(result.error).toMatch(/no models/i)
    expect(result.error).toContain('ollama pull')
  })

  it('explains when the model cannot read the screenshot', async () => {
    const url = await fakeServer((req, _body, res) => {
      if (req.url === '/v1/models') { res.writeHead(200); res.end(models('mistral')); return }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'model does not support images' } }))
    })
    const result = await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: '/tmp/screen.png',
      imageDataUrl: async () => 'data:image/jpeg;base64,QUJD'
    })
    expect(result.error).toMatch(/mistral/)
    expect(result.error).toMatch(/image|screenshot/i)
  })

  it('surfaces a server error with the runtime name', async () => {
    const url = await fakeServer((req, _body, res) => {
      if (req.url === '/v1/models') { res.writeHead(200); res.end(models('mistral')); return }
      res.writeHead(500); res.end('out of memory')
    })
    const result = await run({ servers: [{ name: 'LM Studio', baseUrl: url }] })
    expect(result.error).toContain('LM Studio')
    expect(result.error).toContain('out of memory')
  })

  it('unwraps an error that the runtime nested inside its own error message', async () => {
    // Real Ollama shape: the runner's JSON error is embedded as a string.
    const inner = JSON.stringify({ error: { code: 500, message: 'model failed to load', type: 'server_error' } })
    const url = await fakeServer((req, _body, res) => {
      if (req.url === '/v1/models') { res.writeHead(200); res.end(models('mistral')); return }
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: inner } }))
    })
    const result = await run({ servers: [{ name: 'Ollama', baseUrl: url }] })
    expect(result.error).toBe('Ollama: model failed to load')
  })

  it('gives up on a server that stops responding mid-answer', async () => {
    const url = await fakeServer((req, _body, res) => {
      if (req.url === '/v1/models') { res.writeHead(200); res.end(models('mistral')); return }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Thinking' } }] })}\n\n`)
      // ...and never finishes
    })
    const result = await run({ servers: [{ name: 'Ollama', baseUrl: url }], timeoutMs: 300 })
    expect(result.chunks).toEqual(['Thinking'])
    expect(result.error).toMatch(/timed out/i)
  })
})

describe('localModelOptions', () => {
  it('lists the server models after an Auto choice that names the runtime', () => {
    expect(localModelOptions({ name: 'Ollama', baseUrl: 'x', models: ['mistral', 'llava:7b'] })).toEqual([
      { id: '', label: 'Auto · Ollama' },
      { id: 'mistral', label: 'mistral' },
      { id: 'llava:7b', label: 'llava:7b' }
    ])
  })

  it('offers only Auto when no server is running', () => {
    expect(localModelOptions(null)).toEqual([{ id: '', label: 'Auto' }])
  })
})

describe('askLocal reading the screen for models that cannot see', () => {
  const SHOT = '/tmp/screen.png'
  const SCREEN = '1. Two Sum\nGiven an array of integers nums and an integer target'

  it('sends the screen text instead of the image to a text-only model', async () => {
    const seen: { body?: any } = {}
    const url = await fakeServer(openAiServer(['mistral'], ['Use a hash map'], seen))
    let readFrom = ''
    let imageBuilt = false
    const result = await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: SHOT,
      imageDataUrl: async () => { imageBuilt = true; return 'data:image/jpeg;base64,QUJD' },
      readScreenText: async (path) => { readFrom = path; return SCREEN }
    })
    expect(result).toEqual({ chunks: ['Use a hash map'], done: true, error: '' })
    expect(readFrom).toBe(SHOT)
    expect(imageBuilt).toBe(false)
    const content = seen.body.messages[1].content
    expect(typeof content).toBe('string')
    expect(content).toContain('What is 2+2?')
    expect(content).toContain('Given an array of integers nums')
  })

  it('still shows the image to a model that can see', async () => {
    const seen: { body?: any } = {}
    const url = await fakeServer(openAiServer(['llava:7b'], ['I see it'], seen))
    let ocrUsed = false
    await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: SHOT,
      imageDataUrl: async () => 'data:image/jpeg;base64,QUJD',
      readScreenText: async () => { ocrUsed = true; return SCREEN }
    })
    expect(ocrUsed).toBe(false)
    expect(JSON.stringify(seen.body.messages[1].content)).toContain('image_url')
  })

  it('falls back to the screen text when the server refuses the image', async () => {
    const bodies: any[] = []
    const url = await fakeServer((req, body, res) => {
      if (req.url === '/v1/models') { res.writeHead(200); res.end(models('llava:7b')); return }
      const parsed = JSON.parse(body)
      bodies.push(parsed)
      if (Array.isArray(parsed.messages[1].content)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'model does not support images' } }))
        return
      }
      sse(res, ['From the text'])
    })
    const result = await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: SHOT,
      imageDataUrl: async () => 'data:image/jpeg;base64,QUJD',
      readScreenText: async () => SCREEN
    })
    expect(result).toEqual({ chunks: ['From the text'], done: true, error: '' })
    expect(bodies).toHaveLength(2)
    expect(bodies[1].messages[1].content).toContain('Two Sum')
  })

  it('says so when the screen has no text to read', async () => {
    const url = await fakeServer(openAiServer(['mistral'], ['unused']))
    const result = await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: SHOT,
      readScreenText: async () => '   '
    })
    expect(result.error).toMatch(/no text/i)
    expect(result.error).toMatch(/vision model/i)
  })

  it('explains when reading the screen fails', async () => {
    const url = await fakeServer(openAiServer(['mistral'], ['unused']))
    const result = await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: SHOT,
      readScreenText: async () => { throw new Error('The native helper exited while reading the screen.') }
    })
    expect(result.error).toContain('mistral')
    expect(result.error).toContain('native helper exited')
  })

  it('bounds how much screen text goes into the prompt', async () => {
    const seen: { body?: any } = {}
    const url = await fakeServer(openAiServer(['mistral'], ['ok'], seen))
    await run({
      servers: [{ name: 'Ollama', baseUrl: url }],
      imagePath: SHOT,
      readScreenText: async () => 'word '.repeat(40_000) // ~200KB, far past any useful screen
    })
    expect(seen.body.messages[1].content.length).toBeLessThan(30_000)
  })
})
