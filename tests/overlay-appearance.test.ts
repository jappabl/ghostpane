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

  it('keeps every renderer wrapper clear so only text shows', () => {
    expect(styles).toMatch(/html, body, #root\s*\{[^}]*background:\s*transparent/s)
    expect(styles).toMatch(/\.root\s*\{[^}]*background:\s*transparent/s)
    expect(styles).not.toContain('0 10px 40px rgba(0, 0, 0, 0.45)')
    expect(styles).toMatch(/\.bar\s*\{[^}]*overflow:\s*hidden/s)
  })

  it('paints no plate behind the content: the surface is fully clear', () => {
    expect(styles).toMatch(
      /\.surface\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s
    )
    // No frosted glass anywhere: the tint and blur are gone.
    expect(styles).not.toContain('backdrop-filter')
    expect(styles).not.toContain('rgba(20, 20, 24, 0.62)')
  })
})
