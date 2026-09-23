import { readFile } from 'fs/promises'
import type { ModelOption } from '../shared/providers'
import type { ProviderAskOptions } from './provider-types'
import { SYSTEM_PROMPT } from './claude'
import { MAX_LINE_BYTES, MAX_STDERR_BYTES, PROVIDER_TIMEOUT_MS } from './provider-limits'

export interface LocalServer { name: string; baseUrl: string }
export interface DiscoveredServer extends LocalServer { models: string[] }

// Default addresses of the popular local runtimes. Every one of them serves the
// OpenAI-compatible API, so a single client talks to whichever is running.
// Order is priority when more than one answers.
export const LOCAL_SERVERS: readonly LocalServer[] = [
  { name: 'Ollama', baseUrl: 'http://127.0.0.1:11434' },
  { name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234' },
  { name: 'Jan', baseUrl: 'http://127.0.0.1:1337' },
  { name: 'GPT4All', baseUrl: 'http://127.0.0.1:4891' },
  { name: 'llama.cpp', baseUrl: 'http://127.0.0.1:8080' },
  { name: 'vLLM', baseUrl: 'http://127.0.0.1:8000' }
]

const PROBE_MS = 800
const START_WAIT_MS = 20_000
const START_POLL_MS = 250

const EMBEDDING = /embed/i

export function parseModelList(json: unknown): string[] | null {
  if (!json || typeof json !== 'object') return null
  const data = (json as { data?: unknown }).data
  if (!Array.isArray(data)) return null
  return data
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0 && !EMBEDDING.test(id))
}

export interface DiscoverOptions {
  servers?: readonly LocalServer[]
  fetchFn?: typeof fetch
  probeMs?: number
}

async function probe(server: LocalServer, fetchFn: typeof fetch, probeMs: number): Promise<DiscoveredServer | null> {
  try {
    const res = await fetchFn(`${server.baseUrl}/v1/models`, { signal: AbortSignal.timeout(probeMs) })
    if (!res.ok) return null
    const models = parseModelList(await res.json())
    return models ? { ...server, models } : null
  } catch {
    return null // closed port, unrelated server, or not JSON
  }
}

// Probes every known runtime at once. A server with models beats one without,
// so an idle empty runtime cannot shadow the one the user actually set up.
export async function discoverLocalServer(options: DiscoverOptions = {}): Promise<DiscoveredServer | null> {
  const { servers = LOCAL_SERVERS, fetchFn = fetch, probeMs = PROBE_MS } = options
  const found = (await Promise.all(servers.map((server) => probe(server, fetchFn, probeMs))))
    .filter((server): server is DiscoveredServer => server !== null)
  return found.find((server) => server.models.length > 0) ?? found[0] ?? null
}

export async function waitForServer(options: DiscoverOptions, waitMs: number): Promise<DiscoveredServer | null> {
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const server = await discoverLocalServer(options)
    if (server) return server
    await new Promise((resolve) => setTimeout(resolve, START_POLL_MS))
  }
  return null
}

// The OpenAI-compatible list does not say which models accept images, so go by
// the names of the common vision families.
const VISION = /llava|vision|(^|[^a-z])vl($|[^a-z])|internvl|smolvlm|gemma-?3(?!:1b)|minicpm-v|moondream|pixtral|llama-?4|mistral-small-?3\.[12]|paligemma|molmo/i

export function looksVisionCapable(id: string): boolean {
  return VISION.test(id)
}

export function localModelOptions(server: DiscoveredServer | null): ModelOption[] {
  const auto = { id: '', label: server ? `Auto · ${server.name}` : 'Auto' }
  return [auto, ...(server?.models ?? []).map((id) => ({ id, label: id }))]
}

export function pickModel(models: string[], preferred: string, wantsVision: boolean): string | null {
  if (preferred && models.includes(preferred)) return preferred
  if (wantsVision) {
    const vision = models.find(looksVisionCapable)
    if (vision) return vision
  }
  return models[0] ?? null
}

const NO_SERVER =
  'No local model found. Install Ollama (ollama.com) and run `ollama pull llama3.2`, ' +
  'or open LM Studio and start its server. Ghostpane connects on its own.'

function noModelsMessage(name: string): string {
  return name === 'Ollama'
    ? 'Ollama is running but has no models. Run `ollama pull llama3.2` in Terminal ' +
      '(or `ollama pull gemma3` to also understand images and diagrams).'
    : `${name} is running but has no models loaded. Load one in ${name}, then try again.`
}

function cannotSeeMessage(model: string): string {
  return `${model} can't read screenshots. Type your question instead, or add a vision ` +
    'model (for example `ollama pull gemma3`) and pick it from the list.'
}

const IMAGE_REJECTED = /image|vision|multimodal|mmproj/i

// A dense screen reads to a few thousand characters. Past this it is noise
// that only slows prefill on the user's machine.
const MAX_SCREEN_TEXT = 24_000

function screenPrompt(prompt: string, text: string): string {
  const clipped = text.length > MAX_SCREEN_TEXT
    ? `${text.slice(0, MAX_SCREEN_TEXT)}\n[…more text cut off]`
    : text
  return `${prompt}\n\nThe user's screen, read on-device (layout approximate):\n<screen>\n${clipped}\n</screen>`
}

// Pulls the human message out of an error body. Ollama nests its runner's JSON
// error as a string inside its own, so unwrap more than one level.
function errorDetail(body: string, depth = 0): string {
  try {
    const json = JSON.parse(body)
    const error = json?.error
    const message = typeof error === 'string' ? error : error?.message
    if (typeof message === 'string') {
      return depth < 2 ? errorDetail(message, depth + 1) : message.slice(0, 500)
    }
  } catch { /* not JSON */ }
  return body.trim().slice(0, 500)
}

async function fileDataUrl(path: string): Promise<string> {
  return `data:image/png;base64,${(await readFile(path)).toString('base64')}`
}

export interface LocalAskOptions extends ProviderAskOptions {
  servers?: readonly LocalServer[]
  fetchFn?: typeof fetch
  // Turns the screenshot into a data URL (production downscales it first).
  imageDataUrl?: (path: string) => Promise<string>
  // Launches an installed runtime that is not running; resolves to its name.
  startServer?: () => Promise<string | null>
  // Reads a screenshot's text on-device, for models that cannot see images.
  readScreenText?: (path: string) => Promise<string>
  startWaitMs?: number
}

export function askLocal(options: LocalAskOptions): void {
  let settled = false
  const fail = (message: string) => { if (!settled) { settled = true; options.onError(message) } }
  const done = () => { if (!settled) { settled = true; options.onDone() } }
  runLocal(options, fail, done).catch((error) => fail((error as Error).message))
}

async function runLocal(
  options: LocalAskOptions,
  fail: (message: string) => void,
  done: () => void
): Promise<void> {
  const logIt = options.onLog ?? (() => {})
  const discover: DiscoverOptions = { servers: options.servers, fetchFn: options.fetchFn }

  let server = await discoverLocalServer(discover)
  if (!server && options.startServer) {
    const launched = await options.startServer()
    if (launched) {
      logIt('info', 'started local runtime', { runtime: launched })
      server = await waitForServer(discover, options.startWaitMs ?? START_WAIT_MS)
      if (!server) return fail(`${launched} is starting but isn't answering yet. Give it a few seconds and try again.`)
    }
  }
  if (!server) return fail(NO_SERVER)

  const model = pickModel(server.models, options.model ?? '', Boolean(options.imagePath))
  if (!model) return fail(noModelsMessage(server.name))
  const runtime = server

  // A model that cannot see gets the screen's text, read on-device, instead.
  const readScreen = async (): Promise<string | null> => {
    if (!options.readScreenText || !options.imagePath) { fail(cannotSeeMessage(model)); return null }
    let text: string
    try {
      text = await options.readScreenText(options.imagePath)
    } catch (error) {
      logIt('warn', 'screen text recognition failed', { message: (error as Error).message })
      fail(`${model} can't see images, and reading the screen's text failed: ${(error as Error).message}`)
      return null
    }
    if (!text.trim()) {
      fail(`Found no text on screen for ${model} to read. For pictures and diagrams, ` +
        'pick a vision model (for example `ollama pull gemma3`).')
      return null
    }
    logIt('info', 'sending screen text to a model that cannot see', { model, chars: text.length })
    return screenPrompt(options.prompt, text)
  }

  // Returns 'image-rejected' so the caller can retry with the screen's text;
  // every other outcome has already been reported through done/fail.
  const chat = async (content: string | object[]): Promise<'image-rejected' | 'settled'> => {
    const withImage = Array.isArray(content)
    logIt('info', 'asking local model', { runtime: runtime.name, model, withImage })
    const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS
    const controller = new AbortController()
    let timedOut = false
    const watchdog = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      const res = await (options.fetchFn ?? fetch)(`${runtime.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content }
          ]
        }),
        signal: controller.signal
      })
      if (!res.ok) {
        const detail = errorDetail((await res.text()).slice(0, MAX_STDERR_BYTES))
        logIt('error', 'local model request failed', { runtime: runtime.name, status: res.status, detail })
        if (withImage && IMAGE_REJECTED.test(detail)) return 'image-rejected'
        fail(`${runtime.name}: ${detail || `request failed (HTTP ${res.status})`}`)
        return 'settled'
      }
      await streamDeltas(res.body, options.onChunk, logIt)
      done()
    } catch (error) {
      if (timedOut) {
        fail(`${runtime.name} timed out after ${Math.round(timeoutMs / 1000)}s. Press ⌘⏎ to try again.`)
      } else {
        fail(`${runtime.name}: ${(error as Error).message}`)
      }
    } finally {
      clearTimeout(watchdog)
    }
    return 'settled'
  }

  // Plain string content whenever there is no image: the widest-supported shape.
  let content: string | object[]
  if (!options.imagePath) {
    content = options.prompt
  } else if (options.readScreenText && !looksVisionCapable(model)) {
    const text = await readScreen()
    if (text === null) return
    content = text
  } else {
    // Looks like it can see, or there is no OCR to fall back on: let the server decide.
    content = [
      { type: 'text', text: options.prompt },
      { type: 'image_url', image_url: { url: await (options.imageDataUrl ?? fileDataUrl)(options.imagePath) } }
    ]
  }

  if (await chat(content) === 'image-rejected') {
    const text = await readScreen()
    if (text !== null) await chat(text)
  }
}

// Reads an OpenAI-style server-sent-event stream, emitting each text delta.
async function streamDeltas(
  body: ReadableStream<Uint8Array> | null,
  onDelta: (text: string) => void,
  logIt: NonNullable<ProviderAskOptions['onLog']>
): Promise<void> {
  if (!body) return
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const bytes of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(bytes, { stream: true })
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line.startsWith('data:')) continue // blank separators and keep-alive comments
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      let event
      try { event = JSON.parse(data) } catch { logIt('warn', 'ignoring invalid local stream line'); continue }
      if (event?.error) throw new Error(errorDetail(JSON.stringify(event)))
      const delta = event?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) onDelta(delta)
    }
    if (buffer.length > MAX_LINE_BYTES) {
      logIt('warn', 'discarding oversized local stream line', { bytes: buffer.length })
      buffer = ''
    }
  }
}
