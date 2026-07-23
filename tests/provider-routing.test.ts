import { describe, expect, it, vi } from 'vitest'
import { routeAsk } from '../src/main/provider-router'

describe('routeAsk', () => {
  it('routes ChatGPT without invoking Claude', () => {
    const openai = vi.fn()
    const claude = vi.fn()
    const options = {
      prompt: 'hello', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn()
    }
    routeAsk('openai', { openai, claude }, options)
    expect(openai).toHaveBeenCalledWith(options)
    expect(claude).not.toHaveBeenCalled()
  })

  it('routes Claude without invoking ChatGPT', () => {
    const openai = vi.fn()
    const claude = vi.fn()
    const options = {
      prompt: 'hello', onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn()
    }
    routeAsk('claude', { openai, claude }, options)
    expect(claude).toHaveBeenCalledWith(options)
    expect(openai).not.toHaveBeenCalled()
  })
})
