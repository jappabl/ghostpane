import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OVERLAY_SURFACE_OPTIONS } from '../src/main/overlay-options'

const styles = readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8')

describe('overlay surface isolation', () => {
  it('uses an explicitly transparent native window without a native shadow', () => {
    expect(OVERLAY_SURFACE_OPTIONS).toEqual({
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false
    })
  })

  it('keeps renderer wrappers clear and removes the broad shared shadow', () => {
    expect(styles).toMatch(/html, body, #root\s*\{[^}]*background:\s*transparent/s)
    expect(styles).toMatch(/\.root\s*\{[^}]*background:\s*transparent/s)
    expect(styles).not.toContain('0 10px 40px rgba(0, 0, 0, 0.45)')
    expect(styles).toMatch(
      /\.glass\s*\{[^}]*box-shadow:\s*inset 0 1px 0 rgba\(255, 255, 255, 0\.06\)/s
    )
    expect(styles).toMatch(/\.bar\s*\{[^}]*overflow:\s*hidden/s)
  })
})
