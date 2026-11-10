import { MULTIPLE_CHOICE_MARKER } from '../shared/answer-format'

export const MATH_FORMATTING_GUIDANCE = [
  'Math formatting:',
  '- Use `$...$` for inline math.',
  '- Use `$$...$$` for display math, with each `$$` delimiter on its own line.',
  '- Put multiline equations inside a KaTeX-supported environment within `$$...$$`.',
  '- Use valid LaTeX spacing such as `\\,dA`; do not wrap equations in bare square brackets.'
].join('\n')

// The overlay hides the reasoning and shows only the letter (see
// src/renderer/choice-answer.ts). Reasoning stays: letter-only replies scored
// ~30 points lower on SAT math with local models.
export const MULTIPLE_CHOICE_GUIDANCE = [
  'Multiple-choice questions (lettered options A–D or A–E):',
  `- This overrides "answer immediately": start your reply with the line \`${MULTIPLE_CHOICE_MARKER}\`.`,
  '- Then work the problem step by step.',
  '- End with a final line of exactly `Answer: X`, where X is the letter of the correct option.'
].join('\n')

export function withResponseGuidance(prompt: string): string {
  return `${MATH_FORMATTING_GUIDANCE}\n\n${MULTIPLE_CHOICE_GUIDANCE}\n\nUser request:\n${prompt}`
}
