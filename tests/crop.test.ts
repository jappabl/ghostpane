import { describe, it, expect } from 'vitest'
import { captureThumbnailSize } from '../src/main/crop'

describe('captureThumbnailSize', () => {
  it('leaves a display that already fits under the cap untouched', () => {
    expect(captureThumbnailSize({ x: 0, y: 0, width: 1920, height: 1080 }, 1, 2560))
      .toEqual({ width: 1920, height: 1080 })
  })

  it('caps a 5K display to the long edge instead of allocating its full bitmap', () => {
    expect(captureThumbnailSize({ x: 0, y: 0, width: 2560, height: 1440 }, 2, 2560))
      .toEqual({ width: 2560, height: 1440 })
  })

  it('preserves aspect ratio when it scales a Retina laptop display down', () => {
    expect(captureThumbnailSize({ x: 0, y: 0, width: 1512, height: 982 }, 2, 2560))
      .toEqual({ width: 2560, height: 1663 })
  })

  it('caps the height when the display is taller than it is wide', () => {
    expect(captureThumbnailSize({ x: 0, y: 0, width: 1080, height: 1920 }, 2, 2560))
      .toEqual({ width: 1440, height: 2560 })
  })

  it('never returns a zero dimension for a tiny display', () => {
    const size = captureThumbnailSize({ x: 0, y: 0, width: 1, height: 400 }, 1, 100)
    expect(size.width).toBeGreaterThanOrEqual(1)
    expect(size.height).toBe(100)
  })
})
