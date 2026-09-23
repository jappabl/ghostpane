import { describe, expect, it } from 'vitest'
import { layoutScreenText } from '../src/main/screen-text'

// Every line uses the same character width, so indentation is measurable.
const CW = 0.008
const H = 0.02
const at = (text: string, x: number, y: number) => ({ text, x, y, width: text.length * CW, height: H })

describe('layoutScreenText', () => {
  it('returns nothing for a screen without text', () => {
    expect(layoutScreenText([])).toBe('')
  })

  it('reads lines top to bottom whatever order they were recognised in', () => {
    expect(layoutScreenText([at('third', 0.1, 0.16), at('first', 0.1, 0.1), at('second', 0.1, 0.13)]))
      .toBe('first\nsecond\nthird')
  })

  it('joins pieces of the same row left to right', () => {
    // One character of space between them, as between words.
    expect(layoutScreenText([at('world', 0.1 + 6 * CW, 0.1), at('hello', 0.1, 0.1)])).toBe('hello world')
  })

  it('keeps far-apart pieces of one row on that row, visibly separated', () => {
    expect(layoutScreenText([at('Output:', 0.1, 0.1), at('[0,1]', 0.5, 0.1)])).toBe('Output:    [0,1]')
  })

  it('reads a whole column before the one beside it', () => {
    const left = [at('Given an array', 0.05, 0.1), at('return indices', 0.05, 0.13), at('of two numbers', 0.05, 0.16)]
    const right = [at('class Solution:', 0.55, 0.1), at('def twoSum():', 0.55, 0.13), at('pass', 0.55, 0.16), at('# end', 0.55, 0.19)]
    expect(layoutScreenText([...right, ...left])).toBe(
      'Given an array\nreturn indices\nof two numbers\n\nclass Solution:\ndef twoSum():\npass\n# end'
    )
  })

  it('keeps a title that spans both columns above them', () => {
    const lines = [
      at('1. Two Sum — Easy — Solved — Companies — Topics — Hint', 0.05, 0.02),
      at('Given nums', 0.05, 0.1), at('and target', 0.05, 0.13),
      at('class Solution:', 0.55, 0.1), at('pass', 0.55, 0.13)
    ]
    expect(layoutScreenText(lines).split('\n')[0]).toBe('1. Two Sum — Easy — Solved — Companies — Topics — Hint')
  })

  it('preserves code indentation from where each line starts', () => {
    expect(layoutScreenText([
      at('def f(x):', 0.1, 0.1),
      at('if x:', 0.1 + 4 * CW, 0.13),
      at('return x', 0.1 + 8 * CW, 0.16),
      at('return 0', 0.1 + 4 * CW, 0.19)
    ])).toBe('def f(x):\n    if x:\n        return x\n    return 0')
  })

  it('measures indentation from the column the code is in, not the screen edge', () => {
    const lines = [
      at('Some prose', 0.05, 0.1), at('more prose', 0.05, 0.13),
      at('for i in n:', 0.55, 0.1), at('print(i)', 0.55 + 4 * CW, 0.13)
    ]
    expect(layoutScreenText(lines)).toBe('Some prose\nmore prose\n\nfor i in n:\n    print(i)')
  })

  it('measures indentation in the code font, not the narrower prose font beside it', () => {
    // Prose outnumbers code, so a screen-wide average would use the prose width.
    const PROSE_CW = 0.0065
    const prose = (text: string, y: number) => ({ text, x: 0.05, y, width: text.length * PROSE_CW, height: H })
    const lines = [
      prose('You are given an array', 0.1), prose('of integers nums and', 0.13), prose('an integer target.', 0.16),
      prose('Return the indices of', 0.19), prose('the two numbers.', 0.22),
      at('def f(nums):', 0.55, 0.1),
      at('seen = {}', 0.55 + 4 * CW, 0.13),
      at('if x in seen:', 0.55 + 4 * CW, 0.16),
      at('return i', 0.55 + 8 * CW, 0.19)
    ]
    expect(layoutScreenText(lines).split('\n\n')[1]).toBe(
      'def f(nums):\n    seen = {}\n    if x in seen:\n        return i'
    )
  })

  it('separates paragraphs that have a clear gap between them', () => {
    expect(layoutScreenText([at('Example 1', 0.1, 0.1), at('Input: x', 0.1, 0.13), at('Constraints', 0.1, 0.25)]))
      .toBe('Example 1\nInput: x\n\nConstraints')
  })
})
