import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { shouldRequireSigning, codesignArgs, signApp } = require('../build/afterPack.cjs') as {
  shouldRequireSigning(env: Record<string, string | undefined>): boolean
  codesignArgs(target: string, deep?: boolean): string[]
  signApp(app: string, helper: string, runner: (command: string, args: string[]) => void): void
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

  it('attempts direct signing without relying on trusted-identity discovery', () => {
    const calls: Array<{ command: string; args: string[] }> = []
    signApp('/tmp/Ghostpane.app', '/tmp/ghostpane-helper', (command, args) => {
      calls.push({ command, args })
    })

    expect(calls.map(({ command }) => command)).toEqual(['codesign', 'codesign', 'codesign'])
    expect(calls[0].args).toContain('/tmp/ghostpane-helper')
    expect(calls[1].args).toContain('/tmp/Ghostpane.app')
    expect(calls[2].args).toEqual(['--verify', '--deep', '--strict', '/tmp/Ghostpane.app'])
  })
})
