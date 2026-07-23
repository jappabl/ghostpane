import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownAnswer } from '../src/renderer/components/MarkdownAnswer'
import { normalizeMathDelimiters } from '../src/renderer/math'

describe('normalizeMathDelimiters', () => {
  it('normalizes slash and clear standalone bracket delimiters', () => {
    expect(normalizeMathDelimiters(String.raw`Inline \(x^2\) and display \[\frac{1}{2}\]`))
      .toBe(String.raw`Inline $x^2$ and display $$
\frac{1}{2}
$$`)
    expect(normalizeMathDelimiters(String.raw`[ \boxed{\frac{\pi}{5}} ]`))
      .toBe(String.raw`$$
\boxed{\frac{\pi}{5}}
$$`)
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

function renderMath(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownAnswer, { answer: markdown }))
}

describe('MarkdownAnswer math rendering', () => {
  it('renders the reported integral and boxed answer as KaTeX with MathML', () => {
    const html = renderMath([
      String.raw`[ \iint_R (x^2+y^2)^{3/2}\,dA ]`,
      String.raw`[ \boxed{\frac{\pi}{5}} ]`
    ].join('\n\n'))

    expect(html).toContain('class="katex-display"')
    expect(html).toContain('<math')
    expect(html).toContain('∬')
    expect(html).toContain('π')
  })

  it('renders multiline environments and retains malformed source nonfatally', () => {
    const valid = renderMath(String.raw`\[\begin{cases}x^2 & x>0\\0 & x\le0\end{cases}\]`)
    expect(valid).toContain('class="katex-display"')

    const malformed = renderMath(String.raw`$$\frac{1}{$$`)
    expect(malformed).toContain('katex-error')
    expect(malformed).toContain('\\frac')
  })

  it.each([
    String.raw`$\sum_{n=1}^{\infty} n^{-2}$`,
    String.raw`$\sqrt{x^2+y^2}$`,
    String.raw`$\lim_{x\to0} \frac{\sin x}{x}$`,
    String.raw`$\alpha+\beta+\theta$`,
    String.raw`$$\begin{pmatrix}1&2\\3&4\end{pmatrix}$$`,
    String.raw`$$\begin{gathered}a=b\\c=d\end{gathered}$$`
  ])('renders representative KaTeX input: %s', (source) => {
    expect(renderMath(source)).toContain('class="katex')
  })
})
