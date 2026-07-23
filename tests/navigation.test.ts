import { describe, expect, it } from 'vitest'
import { isExternalHttpsUrl, isTrustedRendererUrl } from '../src/main/navigation'

describe('navigation policy', () => {
  it('allows only credential-free HTTPS external URLs', () => {
    expect(isExternalHttpsUrl('https://example.com/path')).toBe(true)
    expect(isExternalHttpsUrl('https://user:pass@example.com')).toBe(false)
    expect(isExternalHttpsUrl('http://example.com')).toBe(false)
    expect(isExternalHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalHttpsUrl('file:///etc/passwd')).toBe(false)
  })

  it('allows the packaged renderer and same-origin development pages', () => {
    expect(isTrustedRendererUrl(
      'file:///app/renderer/index.html#answer',
      'file:///app/renderer/index.html'
    )).toBe(true)
    expect(isTrustedRendererUrl('https://localhost:5173/page', 'https://localhost:5173')).toBe(true)
    expect(isTrustedRendererUrl('https://evil.test', 'https://localhost:5173')).toBe(false)
  })
})
