import { describe, expect, it } from 'vitest'
import { staleCaptureFiles } from '../src/main/stale-captures'

const HOUR = 3_600_000
const NOW = 1_700_000_000_000

describe('staleCaptureFiles', () => {
  it('selects screenshots a crash left behind', () => {
    const old = `ghostpane-${NOW - 4 * HOUR}-0.png`
    expect(staleCaptureFiles([old], NOW, HOUR)).toEqual([old])
  })

  it('leaves a fresh screenshot alone, which may belong to an ask in flight', () => {
    expect(staleCaptureFiles([`ghostpane-${NOW - 1000}-3.png`], NOW, HOUR)).toEqual([])
  })

  it('ignores files in the temp directory that are not ours', () => {
    const names = ['com.apple.something', 'screenshot.png', `other-${NOW - 4 * HOUR}.png`]
    expect(staleCaptureFiles(names, NOW, HOUR)).toEqual([])
  })

  it('ignores a ghostpane name without a usable timestamp', () => {
    expect(staleCaptureFiles(['ghostpane-notatime-0.png'], NOW, HOUR)).toEqual([])
  })

  it('selects only the stale ones from a mixed directory', () => {
    const stale = `ghostpane-${NOW - 2 * HOUR}-1.png`
    const names = [stale, `ghostpane-${NOW - 60}-2.png`, 'unrelated.txt']
    expect(staleCaptureFiles(names, NOW, HOUR)).toEqual([stale])
  })
})
