import { describe, expect, it } from 'vitest'
import { normalizeMathDelimiters } from '../src/renderer/math'

describe('normalizeMathDelimiters', () => {
  it('normalizes slash and clear standalone bracket delimiters', () => {
    expect(normalizeMathDelimiters(String.raw`Inline \(x^2\) and display \[\frac{1}{2}\]`))
      .toBe(String.raw`Inline $x^2$ and display $$\frac{1}{2}$$`)
    expect(normalizeMathDelimiters(String.raw`[ \boxed{\frac{\pi}{5}} ]`))
      .toBe(String.raw`$$\boxed{\frac{\pi}{5}}$$`)
  })

  it('normalizes multiline standalone bracket blocks', () => {
    const input = String.raw`[
\begin{aligned}
x &= 1 \\
y &= 2
\end{aligned}
]`
    expect(normalizeMathDelimiters(input)).toBe(String.raw`$$
\begin{aligned}
x &= 1 \\
y &= 2
\end{aligned}
$$`)
  })

  it('preserves code, escaped literals, links, prose brackets, and arrays', () => {
    const input = [
      '`\\\\(code\\\\)`',
      '```tex\n\\\\[code\\\\]\n```',
      String.raw`\\\\(literal\\\\)`,
      '[docs](https://example.com)',
      '[ordinary words]',
      '[1, 2, 3]'
    ].join('\n')

    expect(normalizeMathDelimiters(input)).toBe(input)
  })

  it('preserves fenced code when the closing fence is longer', () => {
    const input = '```tex\n\\[\\frac{1}{2}\\]\n````\n~~~tex\n\\(x\\)\n~~~~'
    expect(normalizeMathDelimiters(input)).toBe(input)
  })

  it('protects currency without changing genuine dollar math', () => {
    const input = 'Costs $5, $5.00, $5–$10, or $5 and $10; math is $5 + x$ and $x^2$.'
    expect(normalizeMathDelimiters(input)).toBe(
      String.raw`Costs \$5, \$5.00, \$5–\$10, or \$5 and \$10; math is $5 + x$ and $x^2$.`
    )
  })

  it('leaves existing dollar math and unmatched slash delimiters unchanged', () => {
    const input = String.raw`Inline $x^2$; display $$\int_0^1 x\,dx$$; unmatched \(x.`
    expect(normalizeMathDelimiters(input)).toBe(input)
  })

  it('normalizes the reported integral without deleting content', () => {
    const input = [
      String.raw`[ \iint_R (x^2+y^2)^{3/2},dA ]`,
      String.raw`[ 0\le r\le1,\qquad -\frac{\pi}{2}\le\theta\le\frac{\pi}{2} ]`,
      String.raw`[ \boxed{\frac{\pi}{5}} ]`
    ].join('\n\n')
    const output = normalizeMathDelimiters(input)

    expect(output.match(/\$\$/g)).toHaveLength(6)
    expect(output).toContain(String.raw`\iint_R`)
    expect(output).toContain(String.raw`\boxed{\frac{\pi}{5}}`)
  })
})
