import { describe, it, expect } from 'vitest'
import { displayPixelRect } from '../src/main/crop'

describe('displayPixelRect', () => {
  it('scales DIP bounds by scaleFactor', () => {
    const r = displayPixelRect({ x: 0, y: 0, width: 1440, height: 900 }, 2, 2880, 1800)
    expect(r).toEqual({ x: 0, y: 0, width: 2880, height: 1800 })
  })
  it('clamps to the captured image size', () => {
    const r = displayPixelRect({ x: 0, y: 0, width: 1440, height: 900 }, 2, 2000, 1600)
    expect(r).toEqual({ x: 0, y: 0, width: 2000, height: 1600 })
  })
})
