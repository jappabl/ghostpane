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

  it('does not delete a released path', async () => {
    const unlink = vi.fn().mockResolvedValue(undefined)
    const owned = new OwnedPaths(unlink)
    owned.add('/tmp/a.png')
    owned.release('/tmp/a.png')
    await owned.cleanup()
    expect(unlink).not.toHaveBeenCalled()
  })
})
