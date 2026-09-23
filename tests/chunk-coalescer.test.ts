import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChunkCoalescer } from '../src/renderer/chunk-coalescer'

describe('ChunkCoalescer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not emit on push, so a render cannot run per streamed token', () => {
    const onFlush = vi.fn()
    new ChunkCoalescer(60, onFlush).push('He')
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('emits everything pushed within the window as a single batch', () => {
    const onFlush = vi.fn()
    const c = new ChunkCoalescer(60, onFlush)
    c.push('He'); c.push('llo'); c.push(' world')
    vi.advanceTimersByTime(60)
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith('Hello world')
  })

  it('starts a new window for text pushed after a flush', () => {
    const onFlush = vi.fn()
    const c = new ChunkCoalescer(60, onFlush)
    c.push('one')
    vi.advanceTimersByTime(60)
    c.push('two')
    vi.advanceTimersByTime(60)
    expect(onFlush.mock.calls.map((call) => call[0])).toEqual(['one', 'two'])
  })

  it('flush emits the pending tail immediately', () => {
    const onFlush = vi.fn()
    const c = new ChunkCoalescer(60, onFlush)
    c.push('tail')
    c.flush()
    expect(onFlush).toHaveBeenCalledWith('tail')
  })

  it('flush cancels the scheduled window so the tail is not emitted twice', () => {
    const onFlush = vi.fn()
    const c = new ChunkCoalescer(60, onFlush)
    c.push('tail')
    c.flush()
    vi.advanceTimersByTime(60)
    expect(onFlush).toHaveBeenCalledTimes(1)
  })

  it('flush with nothing buffered emits nothing', () => {
    const onFlush = vi.fn()
    new ChunkCoalescer(60, onFlush).flush()
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('reset drops buffered text so a new ask cannot inherit the previous tail', () => {
    const onFlush = vi.fn()
    const c = new ChunkCoalescer(60, onFlush)
    c.push('stale')
    c.reset()
    vi.advanceTimersByTime(60)
    expect(onFlush).not.toHaveBeenCalled()
  })
})
