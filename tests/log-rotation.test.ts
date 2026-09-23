import { describe, expect, it, vi } from 'vitest'
import { rotateIfOversized, type RotationFs } from '../src/main/log-rotation'

function fakeFs(sizes: Record<string, number>): RotationFs & { renamed: string[][]; removed: string[] } {
  const renamed: string[][] = []
  const removed: string[] = []
  return {
    renamed,
    removed,
    size: (path) => sizes[path] ?? -1,
    rename: (from, to) => { renamed.push([from, to]) },
    remove: (path) => { removed.push(path) }
  }
}

describe('rotateIfOversized', () => {
  it('rotates a log that has grown past the limit', () => {
    const fs = fakeFs({ '/logs/app.log': 3_000_000 })
    expect(rotateIfOversized('/logs/app.log', 2_000_000, fs)).toBe(true)
    expect(fs.renamed).toEqual([['/logs/app.log', '/logs/app.log.1']])
  })

  it('leaves a log under the limit untouched', () => {
    const fs = fakeFs({ '/logs/app.log': 1000 })
    expect(rotateIfOversized('/logs/app.log', 2_000_000, fs)).toBe(false)
    expect(fs.renamed).toEqual([])
  })

  it('keeps only one archive, so the logs cannot grow without bound', () => {
    const fs = fakeFs({ '/logs/app.log': 3_000_000, '/logs/app.log.1': 2_000_000 })
    rotateIfOversized('/logs/app.log', 2_000_000, fs)
    expect(fs.removed).toEqual(['/logs/app.log.1'])
  })

  it('does nothing when the log does not exist yet', () => {
    const fs = fakeFs({})
    expect(rotateIfOversized('/logs/app.log', 2_000_000, fs)).toBe(false)
    expect(fs.renamed).toEqual([])
  })

  it('survives a rename the filesystem refuses', () => {
    const fs = fakeFs({ '/logs/app.log': 3_000_000 })
    fs.rename = vi.fn(() => { throw new Error('EPERM') })
    expect(rotateIfOversized('/logs/app.log', 2_000_000, fs)).toBe(false)
  })
})
