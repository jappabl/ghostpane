import { describe, expect, it } from 'vitest'
import { presentAnswer } from '../src/renderer/choice-answer'

describe('presentAnswer', () => {
  it('shows ordinary answers as they stream', () => {
    expect(presentAnswer('The mean is 5.', false)).toEqual({ kind: 'text', text: 'The mean is 5.' })
  })

  it('holds text that could still turn into the multiple-choice marker', () => {
    expect(presentAnswer('MULTI', false)).toEqual({ kind: 'pending' })
    expect(presentAnswer('**Multiple ch', false)).toEqual({ kind: 'pending' })
  })

  it('releases held text once it stops matching the marker', () => {
    expect(presentAnswer('Multiple factors matter', false)).toEqual({ kind: 'text', text: 'Multiple factors matter' })
  })

  it('hides the reasoning of a multiple-choice answer while it streams', () => {
    expect(presentAnswer('MULTIPLE CHOICE\n2x = 6 so x = 3', false)).toEqual({ kind: 'pending' })
  })

  it('shows only the letter once a multiple-choice answer finishes', () => {
    const text = 'MULTIPLE CHOICE\n2x = 6 so x = 3, which is choice C.\nAnswer: C'
    expect(presentAnswer(text, true)).toEqual({ kind: 'letter', letter: 'C' })
  })

  it('reads the letter through common formatting', () => {
    for (const line of ['**Answer:** B', 'Answer: (B)', 'Answer: B) 12', 'Final answer: **B**', 'answer: $B$', 'Answer - b.']) {
      expect(presentAnswer(`MULTIPLE CHOICE\nwork\n${line}`, true)).toEqual({ kind: 'letter', letter: 'B' })
    }
  })

  it('accepts E as a choice', () => {
    expect(presentAnswer('MULTIPLE CHOICE\nwork\nAnswer: E', true)).toEqual({ kind: 'letter', letter: 'E' })
  })

  it('uses the last answer line when there are several', () => {
    expect(presentAnswer('MULTIPLE CHOICE\nAnswer: A?\nNo, recheck.\nAnswer: D', true)).toEqual({ kind: 'letter', letter: 'D' })
  })

  it('falls back to the full reasoning when no letter is given', () => {
    expect(presentAnswer('**MULTIPLE CHOICE**\nNone of the options fit.', true))
      .toEqual({ kind: 'text', text: 'None of the options fit.' })
  })

  it('collapses an unmarked answer that ends on a letter', () => {
    expect(presentAnswer('Solve: x = 3.\n\nAnswer: C', true)).toEqual({ kind: 'letter', letter: 'C' })
  })

  it('leaves an ordinary finished answer alone', () => {
    expect(presentAnswer('Use a hash map.', true)).toEqual({ kind: 'text', text: 'Use a hash map.' })
  })

  it('does not take a word starting with A–E as a letter', () => {
    expect(presentAnswer('Answer: Because the loop never ends', true))
      .toEqual({ kind: 'text', text: 'Answer: Because the loop never ends' })
  })

  it('shows nothing before any text arrives', () => {
    expect(presentAnswer('', false)).toEqual({ kind: 'pending' })
  })
})

describe('presentAnswer without the marker', () => {
  it('keeps a final line that only starts with an article', () => {
    expect(presentAnswer('Pick a structure.\nAnswer: a hash map', true).kind).toBe('text')
  })

  it('keeps a final answer line that carries more than a letter', () => {
    expect(presentAnswer('Answer: B) 12 meters', true).kind).toBe('text')
  })
})

describe('presentAnswer in explain mode', () => {
  it('streams the worked answer without the marker line', () => {
    expect(presentAnswer('MULTIPLE CHOICE\n3x = 15 so x = 5', false, 'explain'))
      .toEqual({ kind: 'text', text: '3x = 15 so x = 5' })
  })

  it('keeps the final answer line instead of collapsing to the letter', () => {
    expect(presentAnswer('MULTIPLE CHOICE\n3x = 15 so x = 5\n\nAnswer: B', true, 'explain'))
      .toEqual({ kind: 'text', text: '3x = 15 so x = 5\n\nAnswer: B' })
  })

  it('holds a possible marker, then shows ordinary text as it streams', () => {
    expect(presentAnswer('MULTI', false, 'explain')).toEqual({ kind: 'pending' })
    expect(presentAnswer('Binary search halves', false, 'explain')).toEqual({ kind: 'text', text: 'Binary search halves' })
  })

  it('shows nothing until the marker line is followed by text', () => {
    expect(presentAnswer('MULTIPLE CHOICE\n', false, 'explain')).toEqual({ kind: 'pending' })
  })
})
