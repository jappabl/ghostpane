// Multiple-choice questions show only the chosen letter. The model still
// reasons (letter-only replies cost local models ~30 points on SAT math), so it
// opens with MULTIPLE_CHOICE_MARKER, works the problem, and ends on
// "Answer: X". The reasoning is hidden; only X is shown.
import { MULTIPLE_CHOICE_MARKER } from '../shared/answer-format'
import type { AnswerMode } from '../shared/ipc'

export type AnswerView =
  | { kind: 'pending' }
  | { kind: 'text'; text: string }
  | { kind: 'letter'; letter: string }

// "Answer: B", "**Final answer:** (b)", "Answer: $B$", "Answer: B) 12" …
const ANSWER_LINE = /^[\s*_#>]*(?:final\s+)?answer\s*(?:is)?[\s*_]*[:\-–—]?[\s*_($\\{]*([A-E])(?![A-Za-z])/i
// Without the marker, collapse only on a bare final line ("Answer: B"), with a
// capital letter, so "Answer: a hash map" stays text.
const BARE_ANSWER_LINE = /^[\s*_#>]*(?:final\s+)?answer\s*(?:is)?[\s*_]*[:\-–—]?[\s*_($\\{]*([A-E])[\s*_)$}.]*$/i
// Markdown that may wrap the marker line.
const DECORATION = /[\s*_#>`]/g

function lastAnswerLetter(text: string): string | null {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = ANSWER_LINE.exec(lines[i])
    if (match) return match[1].toUpperCase()
  }
  return null
}

function lastLineIsAnswer(text: string): string | null {
  const last = text.trimEnd().split('\n').pop() ?? ''
  const match = BARE_ANSWER_LINE.exec(last)
  return match && /[A-E]/.test(match[1]) ? match[1] : null
}

export function presentAnswer(text: string, done: boolean, mode: AnswerMode = 'letter'): AnswerView {
  const marker = MULTIPLE_CHOICE_MARKER.replace(DECORATION, '')
  const firstLine = text.trimStart().split('\n')[0]
  const head = firstLine.replace(DECORATION, '').toUpperCase()
  const firstLineComplete = text.trimStart().includes('\n')

  if (head === marker && (firstLineComplete || done)) {
    // Explain mode shows the whole worked answer, only without the marker.
    if (mode === 'explain') {
      const rest = text.trimStart().slice(firstLine.length).trim()
      return rest ? { kind: 'text', text: rest } : { kind: 'pending' }
    }
    if (!done) return { kind: 'pending' }
    const letter = lastAnswerLetter(text)
    if (letter) return { kind: 'letter', letter }
    return { kind: 'text', text: text.trimStart().slice(firstLine.length).trim() }
  }
  // Could still become the marker: hold it rather than flash it on screen.
  if (!done && marker.startsWith(head)) return { kind: 'pending' }

  if (done && mode === 'letter') {
    const letter = lastLineIsAnswer(text)
    if (letter) return { kind: 'letter', letter }
  }
  return text ? { kind: 'text', text } : { kind: 'pending' }
}
