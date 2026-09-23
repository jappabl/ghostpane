import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { HelperJsonlParser, NativeHelper, resolveNativeHelperPath } from '../src/main/native-helper'
import { buildAudioPrompt } from '../src/main/audio-context'

describe('HelperJsonlParser', () => {
  it('parses events split across output chunks', () => {
    const parser = new HelperJsonlParser()
    expect(parser.push('{"protocolVersion":1,')).toEqual([])
    expect(parser.push('"type":"tap"}\n')).toEqual([
      { protocolVersion: 1, type: 'tap' }
    ])
  })

  it('ignores malformed and unsupported protocol events', () => {
    const parser = new HelperJsonlParser()
    expect(parser.push('not-json\n{"protocolVersion":2,"type":"tap"}\n')).toEqual([])
  })
})

describe('native helper paths', () => {
  it('uses the packaged Resources directory in production', () => {
    expect(resolveNativeHelperPath(true, '/App/Contents/Resources', '/repo'))
      .toBe('/App/Contents/Resources/native/ghostpane-helper')
  })

  it('uses the repository build output in development', () => {
    expect(resolveNativeHelperPath(false, '/unused', '/repo'))
      .toBe('/repo/build/native/ghostpane-helper')
  })
})

describe('buildAudioPrompt', () => {
  it('labels microphone and system transcripts', () => {
    expect(buildAudioPrompt('', 'my question', 'meeting response')).toBe(
      'Use the screenshot and audio context to answer concisely.\n\n' +
      'Microphone transcript:\nmy question\n\n' +
      'System audio transcript:\nmeeting response'
    )
  })

  it('preserves a typed prompt and normalizes empty transcripts', () => {
    expect(buildAudioPrompt('Explain', '', '')).toContain(
      'Explain\n\nMicrophone transcript:\nNo speech detected'
    )
  })
})

// A helper process whose stdin commands are recorded and whose replies we script.
function fakeHelper() {
  const writes: any[] = []
  const child: any = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { writable: true, write: (line: string) => { writes.push(JSON.parse(line)) } }
  child.kill = () => {}
  const reply = (event: object) =>
    child.stdout.emit('data', Buffer.from(JSON.stringify({ protocolVersion: 1, ...event }) + '\n'))
  return { child, writes, reply }
}

function startedHelper(onEvent = vi.fn()) {
  const fake = fakeHelper()
  // Any path that exists satisfies the start-up check; the spawn is faked.
  const helper = new NativeHelper(process.execPath, { onEvent, onUnavailable: vi.fn() }, (() => fake.child) as any)
  helper.start()
  return { helper, onEvent, ...fake }
}

const LINE = { text: 'def twoSum', x: 0.1, y: 0.2, width: 0.3, height: 0.02 }

describe('HelperJsonlParser OCR events', () => {
  it('parses recognised lines with their request id', () => {
    const parser = new HelperJsonlParser()
    expect(parser.push(JSON.stringify({ protocolVersion: 1, type: 'ocr-result', id: '3', lines: [LINE] }) + '\n'))
      .toEqual([{ protocolVersion: 1, type: 'ocr-result', id: '3', lines: [LINE] }])
  })

  it('drops malformed lines rather than the whole result', () => {
    const parser = new HelperJsonlParser()
    const [event] = parser.push(JSON.stringify({
      protocolVersion: 1, type: 'ocr-result', id: '3', lines: [LINE, { text: 5 }, { text: 'x', x: 'left' }]
    }) + '\n')
    expect(event.lines).toEqual([LINE])
  })
})

describe('NativeHelper.recognizeText', () => {
  it('asks the helper to read the image and resolves with its lines', async () => {
    const { helper, writes, reply } = startedHelper()
    const pending = helper.recognizeText('/tmp/screen.png')
    expect(writes).toEqual([{ protocolVersion: 1, type: 'ocr', id: writes[0].id, path: '/tmp/screen.png' }])
    reply({ type: 'ocr-result', id: writes[0].id, lines: [LINE] })
    await expect(pending).resolves.toEqual([LINE])
  })

  it('matches each reply to its own request when they finish out of order', async () => {
    const { helper, writes, reply } = startedHelper()
    const first = helper.recognizeText('/tmp/a.png')
    const second = helper.recognizeText('/tmp/b.png')
    reply({ type: 'ocr-result', id: writes[1].id, lines: [{ ...LINE, text: 'b' }] })
    reply({ type: 'ocr-result', id: writes[0].id, lines: [{ ...LINE, text: 'a' }] })
    expect((await first)[0].text).toBe('a')
    expect((await second)[0].text).toBe('b')
  })

  it('rejects with the reason when the helper cannot read the image', async () => {
    const { helper, writes, reply } = startedHelper()
    const pending = helper.recognizeText('/tmp/screen.png')
    reply({ type: 'ocr-failed', id: writes[0].id, message: 'unreadable' })
    await expect(pending).rejects.toThrow('unreadable')
  })

  it('keeps OCR replies away from the audio event handler', async () => {
    const { helper, writes, reply, onEvent } = startedHelper()
    const pending = helper.recognizeText('/tmp/screen.png')
    reply({ type: 'ocr-failed', id: writes[0].id, message: 'unreadable' })
    await pending.catch(() => {})
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('gives up when the helper never answers', async () => {
    const { helper } = startedHelper()
    await expect(helper.recognizeText('/tmp/screen.png', 30)).rejects.toThrow(/timed out/i)
  })

  it('fails pending requests when the helper exits', async () => {
    const { helper, child } = startedHelper()
    const pending = helper.recognizeText('/tmp/screen.png')
    helper.stop()
    child.emit('close', 0)
    await expect(pending).rejects.toThrow(/exited/i)
  })

  it('fails at once when the helper is not running', async () => {
    const helper = new NativeHelper('/does/not/exist', { onEvent: vi.fn(), onUnavailable: vi.fn() })
    expect(helper.running).toBe(false)
    await expect(helper.recognizeText('/tmp/screen.png')).rejects.toThrow(/not running/i)
  })
})
