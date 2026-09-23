import { describe, expect, it, vi } from 'vitest'
import { routeAsk } from '../src/main/provider-router'

describe('routeAsk', () => {
  it('routes ChatGPT without invoking Claude', () => {
    const openai = vi.fn()
    const claude = vi.fn()
    const options = {
      prompt: 'hello', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn()
    }
    routeAsk('openai', { openai, claude, local: vi.fn() }, options)
    expect(openai).toHaveBeenCalledWith(options)
    expect(claude).not.toHaveBeenCalled()
  })

  it('routes Claude without invoking ChatGPT', () => {
    const openai = vi.fn()
    const claude = vi.fn()
    const options = {
      prompt: 'hello', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn()
    }
    routeAsk('claude', { openai, claude, local: vi.fn() }, options)
    expect(claude).toHaveBeenCalledWith(options)
    expect(openai).not.toHaveBeenCalled()
  })

  it('routes Local to the local model client', () => {
    const openai = vi.fn()
    const claude = vi.fn()
    const local = vi.fn()
    const options = {
      prompt: 'hello', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn()
    }
    routeAsk('local', { openai, claude, local }, options)
    expect(local).toHaveBeenCalledWith(options)
    expect(openai).not.toHaveBeenCalled()
    expect(claude).not.toHaveBeenCalled()
  })
})
