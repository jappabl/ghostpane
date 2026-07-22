import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { shouldRequireSigning } = require('../build/afterPack.cjs') as {
  shouldRequireSigning(env: Record<string, string | undefined>): boolean
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
})
