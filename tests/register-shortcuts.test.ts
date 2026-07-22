import { describe, it, expect, vi } from 'vitest'
import { registerShortcuts } from '../src/main/register-shortcuts'
import type { MainEvent } from '../src/shared/ipc'

describe('registerShortcuts', () => {
  it('registers every default shortcut and routes callbacks to events', () => {
    const callbacks: Record<string, () => void> = {}
    const register = vi.fn((acc: string, cb: () => void) => { callbacks[acc] = cb; return true })
    const events: MainEvent[] = []
    const results = registerShortcuts((e) => events.push(e), { register })
    expect(results.length).toBe(7)
    expect(results.every((r) => r.ok)).toBe(true)
    callbacks['CommandOrControl+\\']()
    expect(events).toContain('toggle')
  })

  it('marks ok=false when registration fails', () => {
    const register = vi.fn(() => false)
    const results = registerShortcuts(() => {}, { register })
    expect(results.every((r) => !r.ok)).toBe(true)
  })
})
