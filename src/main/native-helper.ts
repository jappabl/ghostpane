import { spawn as realSpawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface NativePermissions {
  accessibility: 'granted' | 'denied' | 'notDetermined' | 'restricted'
  microphone: 'granted' | 'denied' | 'notDetermined' | 'restricted'
  screen: 'granted' | 'denied' | 'notDetermined' | 'restricted'
  speech: 'granted' | 'denied' | 'notDetermined' | 'restricted'
  macOSMajor: number
  canOwnHotkey: boolean
  audioSupported: boolean
}

// One line of text the helper recognised. Position and size are fractions of
// the image, measured from its top-left corner.
export interface TextLine {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface NativeHelperEvent {
  protocolVersion: 1
  type: 'ready' | 'permission-state' | 'tap' | 'hold-started' | 'hold-progress' |
    'transcribing' | 'hold-finished' | 'hold-cancelled' | 'error' |
    'ocr-result' | 'ocr-failed'
  id?: string
  lines?: TextLine[]
  permissions?: NativePermissions
  microphoneTranscript?: string
  systemTranscript?: string
  durationMs?: number
  elapsedMs?: number
  message?: string
}

const EVENT_TYPES = new Set<NativeHelperEvent['type']>([
  'ready', 'permission-state', 'tap', 'hold-started', 'hold-progress',
  'transcribing', 'hold-finished', 'hold-cancelled', 'error',
  'ocr-result', 'ocr-failed'
])

// Far more than any screen holds; bounds what a malformed reply can allocate.
const MAX_OCR_LINES = 4000
const OCR_TIMEOUT_MS = 15_000

function isTextLine(value: unknown): value is TextLine {
  if (!value || typeof value !== 'object') return false
  const line = value as Record<string, unknown>
  return typeof line.text === 'string' &&
    [line.x, line.y, line.width, line.height].every((n) => typeof n === 'number' && Number.isFinite(n))
}

function parseLines(value: unknown): TextLine[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter(isTextLine).slice(0, MAX_OCR_LINES)
    .map(({ text, x, y, width, height }) => ({ text, x, y, width, height }))
}

function parsePermissions(value: unknown): NativePermissions | undefined {
  if (!value || typeof value !== 'object') return undefined
  const p = value as Record<string, unknown>
  const statuses = ['granted', 'denied', 'notDetermined', 'restricted']
  if (![p.accessibility, p.microphone, p.screen, p.speech]
    .every((status) => statuses.includes(String(status))) ||
    typeof p.macOSMajor !== 'number') return undefined
  return {
    accessibility: p.accessibility as NativePermissions['accessibility'],
    microphone: p.microphone as NativePermissions['microphone'],
    screen: p.screen as NativePermissions['screen'],
    speech: p.speech as NativePermissions['speech'],
    macOSMajor: p.macOSMajor,
    canOwnHotkey: p.accessibility === 'granted',
    audioSupported: p.macOSMajor >= 14 &&
      p.accessibility === 'granted' && p.microphone === 'granted' &&
      p.screen === 'granted' && p.speech === 'granted'
  }
}

function parseEvent(value: unknown): NativeHelperEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  if (event.protocolVersion !== 1 || !EVENT_TYPES.has(event.type as NativeHelperEvent['type'])) return null
  const result: NativeHelperEvent = { protocolVersion: 1, type: event.type as NativeHelperEvent['type'] }
  const permissions = parsePermissions(event.permissions)
  if (permissions) result.permissions = permissions
  if (typeof event.microphoneTranscript === 'string') result.microphoneTranscript = event.microphoneTranscript
  if (typeof event.systemTranscript === 'string') result.systemTranscript = event.systemTranscript
  if (typeof event.durationMs === 'number') result.durationMs = event.durationMs
  if (typeof event.elapsedMs === 'number') result.elapsedMs = event.elapsedMs
  if (typeof event.message === 'string') result.message = event.message
  if (typeof event.id === 'string') result.id = event.id
  const lines = parseLines(event.lines)
  if (lines) result.lines = lines
  return result
}

export class HelperJsonlParser {
  private buffer = ''

  push(chunk: string): NativeHelperEvent[] {
    this.buffer += chunk
    const events: NativeHelperEvent[] = []
    let newline
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (!line) continue
      try {
        const event = parseEvent(JSON.parse(line))
        if (event) events.push(event)
      } catch { /* malformed helper output is ignored and logged by the owner */ }
    }
    return events
  }
}

export function resolveNativeHelperPath(
  isPackaged: boolean,
  resourcesPath: string,
  projectRoot: string
): string {
  return isPackaged
    ? join(resourcesPath, 'native', 'ghostpane-helper')
    : join(projectRoot, 'build', 'native', 'ghostpane-helper')
}

interface NativeHelperCallbacks {
  onEvent(event: NativeHelperEvent): void
  onUnavailable(message: string): void
  onLog?(level: 'info' | 'warn' | 'error', message: string, extra?: unknown): void
}

export class NativeHelper {
  private child: ChildProcessWithoutNullStreams | null = null
  private expectedStop = false
  private restarts = 0
  private nextRequestId = 0
  private readonly pendingText = new Map<string, {
    resolve: (lines: TextLine[]) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  constructor(
    private readonly executablePath: string,
    private readonly callbacks: NativeHelperCallbacks,
    private readonly spawnFn: typeof realSpawn = realSpawn
  ) {}

  start(): boolean {
    if (this.child) return true
    if (!existsSync(this.executablePath)) {
      this.callbacks.onUnavailable(`Audio helper not found at ${this.executablePath}`)
      return false
    }
    this.expectedStop = false
    const parser = new HelperJsonlParser()
    const child = this.spawnFn(this.executablePath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    child.stdout.on('data', (data) => {
      for (const event of parser.push(data.toString())) {
        // OCR replies answer a request; they are not app events.
        if (event.type === 'ocr-result') this.settleText(event.id ?? '', event.lines ?? [])
        else if (event.type === 'ocr-failed') this.settleText(event.id ?? '', new Error(event.message ?? 'Text recognition failed.'))
        else this.callbacks.onEvent(event)
      }
    })
    child.stderr.on('data', (data) => {
      this.callbacks.onLog?.('warn', 'audio helper', { message: data.toString().trim().slice(0, 800) })
    })
    child.on('error', (error) => {
      this.callbacks.onLog?.('error', 'audio helper process error', error)
    })
    child.on('close', (code) => {
      this.child = null
      for (const id of [...this.pendingText.keys()]) {
        this.settleText(id, new Error('The native helper exited while reading the screen.'))
      }
      if (this.expectedStop) return
      if (this.restarts < 1) {
        this.restarts += 1
        this.callbacks.onLog?.('warn', 'audio helper exited; restarting once', { code })
        setTimeout(() => this.start(), 150)
      } else {
        this.callbacks.onUnavailable(`Audio helper exited twice (last code ${code ?? 'unknown'}).`)
      }
    })
    return true
  }

  get running(): boolean {
    return Boolean(this.child?.stdin.writable)
  }

  send(type: 'permissions' | 'request-permissions' | 'cancel' | 'shutdown'): void {
    this.write({ protocolVersion: 1, type })
  }

  // Reads the text in an image on-device (Vision framework, in the helper).
  recognizeText(path: string, timeoutMs = OCR_TIMEOUT_MS): Promise<TextLine[]> {
    if (!this.running) return Promise.reject(new Error('The native helper is not running.'))
    const id = String(++this.nextRequestId)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settleText(id, new Error(`Reading the screen's text timed out after ${Math.round(timeoutMs / 1000)}s.`))
      }, timeoutMs)
      this.pendingText.set(id, { resolve, reject, timer })
      this.write({ protocolVersion: 1, type: 'ocr', id, path })
    })
  }

  private settleText(id: string, outcome: TextLine[] | Error): void {
    const pending = this.pendingText.get(id)
    if (!pending) return
    this.pendingText.delete(id)
    clearTimeout(pending.timer)
    if (outcome instanceof Error) pending.reject(outcome)
    else pending.resolve(outcome)
  }

  private write(command: object): void {
    if (this.child?.stdin.writable) {
      this.child.stdin.write(JSON.stringify(command) + '\n')
    }
  }

  stop(): void {
    this.expectedStop = true
    this.send('shutdown')
    setTimeout(() => this.child?.kill(), 500)
  }
}
