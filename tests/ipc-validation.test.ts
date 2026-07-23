import { describe, expect, it } from 'vitest'
import {
  isTrustedSender,
  parseAskRequest,
  parseBoolean,
  parseModel,
  parseProvider,
  parseResize
} from '../src/main/ipc-validation'

describe('IPC payload validation', () => {
  it('accepts a bounded ask request', () => {
    expect(parseAskRequest({ prompt: 'hello', withScreenshot: true }))
      .toEqual({ prompt: 'hello', withScreenshot: true })
  })

  it('rejects malformed and oversized ask requests', () => {
    expect(parseAskRequest({ prompt: 4, withScreenshot: true })).toBeNull()
    expect(parseAskRequest({ prompt: 'x'.repeat(20_001), withScreenshot: false })).toBeNull()
    expect(parseAskRequest({ prompt: 'ok', withScreenshot: 'yes' })).toBeNull()
  })

  it('validates primitive and provider-specific values', () => {
    expect(parseBoolean(true)).toBe(true)
    expect(parseBoolean(1)).toBeNull()
    expect(parseResize(480)).toBe(480)
    expect(parseResize(Number.NaN)).toBeNull()
    expect(parseProvider('openai')).toBe('openai')
    expect(parseProvider('other')).toBeNull()
    expect(parseModel('openai', 'gpt-5.6-sol')).toBe('gpt-5.6-sol')
    expect(parseModel('openai', 'sonnet')).toBeNull()
  })
})

describe('IPC sender validation', () => {
  it('requires the current main frame and expected renderer URL', () => {
    const mainFrame = { url: 'file:///app/renderer/index.html' }
    const webContents = { mainFrame, getURL: () => mainFrame.url }
    const win = { webContents }
    expect(isTrustedSender({ sender: webContents, senderFrame: mainFrame }, win)).toBe(true)
    expect(isTrustedSender({ sender: webContents, senderFrame: { url: mainFrame.url } }, win)).toBe(false)
    expect(isTrustedSender({ sender: webContents, senderFrame: { url: 'https://evil.test' } }, win)).toBe(false)
  })
})
