import { describe, expect, it } from 'vitest'
import { HelperJsonlParser, resolveNativeHelperPath } from '../src/main/native-helper'
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
