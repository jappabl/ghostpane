export const MATH_FORMATTING_GUIDANCE = [
  'Math formatting:',
  '- Use `$...$` for inline math.',
  '- Use `$$...$$` for display math, with each `$$` delimiter on its own line.',
  '- Put multiline equations inside a KaTeX-supported environment within `$$...$$`.',
  '- Use valid LaTeX spacing such as `\\,dA`; do not wrap equations in bare square brackets.'
].join('\n')

export function withResponseGuidance(prompt: string): string {
  return `${MATH_FORMATTING_GUIDANCE}\n\nUser request:\n${prompt}`
}
