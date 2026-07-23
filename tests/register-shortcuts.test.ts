import { describe, it, expect, vi } from 'vitest'
import { registerShortcuts, syncAudioSetupShortcut } from '../src/main/register-shortcuts'
import { AUDIO_SHORTCUT, DEFAULT_SHORTCUTS } from '../src/shared/shortcuts'
import type { MainEvent } from '../src/shared/ipc'

describe('registerShortcuts', () => {
  it('registers every default shortcut and routes callbacks to events', () => {
    const callbacks: Record<string, () => void> = {}
    const register = vi.fn((acc: string, cb: () => void) => { callbacks[acc] = cb; return true })
    const events: MainEvent[] = []
    const results = registerShortcuts((e) => events.push(e), { register })
    expect(results.length).toBe(8)
    expect(results.every((r) => r.ok)).toBe(true)
    callbacks['CommandOrControl+\\']()
    expect(events).toContain('toggle')
  })

  it('marks ok=false when registration fails', () => {
    const register = vi.fn(() => false)
    const results = registerShortcuts(() => {}, { register })
    expect(results.every((r) => !r.ok)).toBe(true)
  })

  it('always registers screenshot as a default shortcut', () => {
    const accelerators: string[] = []
    registerShortcuts(() => {}, {
      register: (accelerator) => { accelerators.push(accelerator); return true }
    })

    expect(accelerators).toContain(DEFAULT_SHORTCUTS['ask-screenshot'])
    expect(AUDIO_SHORTCUT).toBe('CommandOrControl+Shift+Return')
  })

  it('registers audio setup only while the helper cannot own the chord', () => {
    const registered = new Set<string>()
    const callbacks = new Map<string, () => void>()
    const onSetup = vi.fn()
    const deps = {
      register: vi.fn((accelerator: string, callback: () => void) => {
        registered.add(accelerator)
        callbacks.set(accelerator, callback)
        return true
      }),
      unregister: vi.fn((accelerator: string) => { registered.delete(accelerator) }),
      isRegistered: (accelerator: string) => registered.has(accelerator)
    }

    expect(syncAudioSetupShortcut(false, onSetup, deps)).toBe(true)
    expect(registered.has(AUDIO_SHORTCUT)).toBe(true)
    callbacks.get(AUDIO_SHORTCUT)?.()
    expect(onSetup).toHaveBeenCalledOnce()

    expect(syncAudioSetupShortcut(false, onSetup, deps)).toBe(true)
    expect(deps.register).toHaveBeenCalledTimes(1)

    expect(syncAudioSetupShortcut(true, onSetup, deps)).toBe(true)
    expect(deps.unregister).toHaveBeenCalledWith(AUDIO_SHORTCUT)
    expect(registered.has(AUDIO_SHORTCUT)).toBe(false)
  })
})
