import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { shouldRequireSigning, codesignArgs } = require('../build/afterPack.cjs') as {
  shouldRequireSigning(env: Record<string, string | undefined>): boolean
  codesignArgs(target: string, deep?: boolean): string[]
}

describe('release signing policy', () => {
  it('requires signing in CI', () => {
    expect(shouldRequireSigning({ CI: 'true' })).toBe(true)
  })

  it('requires signing when explicitly requested', () => {
    expect(shouldRequireSigning({ GHOSTPANE_REQUIRE_SIGNING: '1' })).toBe(true)
  })

  it('keeps local development packaging permissive', () => {
    expect(shouldRequireSigning({})).toBe(false)
  })

  it('does not enable hardened runtime for a self-signed Electron app', () => {
    expect(codesignArgs('/tmp/Ghostpane.app', true)).toEqual([
      '--force', '--deep', '--timestamp=none', '--sign',
      'Ghostpane Local Signing', '/tmp/Ghostpane.app'
    ])
  })
})
