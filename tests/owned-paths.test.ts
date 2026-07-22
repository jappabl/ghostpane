import { describe, expect, it, vi } from 'vitest'
import { OwnedPaths } from '../src/main/owned-paths'

describe('OwnedPaths', () => {
  it('unlinks each owned path exactly once when cleanup repeats', async () => {
    const unlink = vi.fn().mockResolvedValue(undefined)
    const owned = new OwnedPaths(unlink)
    owned.add('/tmp/a.png')
    await owned.cleanup()
    await owned.cleanup()
    expect(unlink).toHaveBeenCalledTimes(1)
    expect(unlink).toHaveBeenCalledWith('/tmp/a.png')
  })

  it('continues cleanup after one unlink fails', async () => {
    const unlink = vi.fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce(undefined)
    const owned = new OwnedPaths(unlink)
    owned.add('/tmp/a.png')
    owned.add('/tmp/b.png')
    await owned.cleanup()
    expect(unlink).toHaveBeenCalledTimes(2)
  })

  it('reports cleanup failures without throwing', async () => {
    const error = new Error('busy')
    const report = vi.fn()
    const owned = new OwnedPaths(vi.fn().mockRejectedValue(error), report)
    owned.add('/tmp/a.png')
    await expect(owned.cleanup()).resolves.toBeUndefined()
    expect(report).toHaveBeenCalledWith('/tmp/a.png', error)
  })

  it('does not delete a released path', async () => {
    const unlink = vi.fn().mockResolvedValue(undefined)
    const owned = new OwnedPaths(unlink)
    owned.add('/tmp/a.png')
    owned.release('/tmp/a.png')
    await owned.cleanup()
    expect(unlink).not.toHaveBeenCalled()
  })
})
