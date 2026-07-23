# Reliable Math Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render standard AI-generated LaTeX as safe, readable KaTeX while leaving code, currency, links, literal brackets, and malformed expressions readable.

**Architecture:** A deterministic preprocessor normalizes common slash and conservative bracket delimiters before `react-markdown`, without touching code spans or fenced blocks and while protecting currency-shaped dollar tokens. `remark-math` creates math nodes and `rehype-katex` renders local HTML/MathML with trust disabled; shared provider guidance asks both Claude and ChatGPT for canonical dollar delimiters.

**Tech Stack:** React 18, `react-markdown` 9, `remark-math`, `rehype-katex`, KaTeX, TypeScript/Vitest, React server rendering for integration tests.

## Global Constraints

- Support `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and clearly mathematical standalone `[ ... ]` blocks.
- Support multiline KaTeX environments including `aligned`, `gathered`, `matrix`, `pmatrix`, and `cases`.
- Never normalize delimiters inside inline code, fenced code, or escaped literals.
- Preserve Markdown links, ordinary bracketed prose, arrays, and currency such as `$5`, `$5.00`, `Costs $5 and $10`, and `$5–$10`.
- Keep KaTeX `trust: false`, omit raw-HTML plugins, retain generated MathML, and render malformed source nonfatally.
- Do not promise arbitrary TeX packages beyond KaTeX support.

---

### Task 1: Add and test the math delimiter normalizer

**Files:**
- Create: `src/renderer/math.ts`
- Create: `tests/math.test.ts`

**Interfaces:**
- Produces: `normalizeMathDelimiters(markdown: string): string`.
- Internal helpers: `mapOutsideCode`, `normalizeSlashDelimiters`, `normalizeBracketBlocks`, `escapeCurrencyDollars`.

- [ ] **Step 1: Write failing normalization tests**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeMathDelimiters } from '../src/renderer/math'

describe('normalizeMathDelimiters', () => {
  it('normalizes slash and clear standalone bracket delimiters', () => {
    expect(normalizeMathDelimiters('Inline \\(x^2\\) and display \\[\\frac{1}{2}\\]'))
      .toBe('Inline $x^2$ and display $$\\frac{1}{2}$$')
    expect(normalizeMathDelimiters('[ \\boxed{\\frac{\\pi}{5}} ]'))
      .toBe('$$\\boxed{\\frac{\\pi}{5}}$$')
  })

  it('normalizes multiline standalone bracket blocks', () => {
    const input = '[\n\\begin{aligned}\nx &= 1 \\\\\\ny &= 2\n\\end{aligned}\n]'
    expect(normalizeMathDelimiters(input)).toBe(
      '$$\n\\begin{aligned}\nx &= 1 \\\\\\ny &= 2\n\\end{aligned}\n$$'
    )
  })

  it('preserves code, escaped literals, links, prose brackets, and arrays', () => {
    const input = [
      '`\\(code\\)`',
      '```tex\n\\[code\\]\n```',
      String.raw`\\\\(literal\\\\)`,
      '[docs](https://example.com)',
      '[ordinary words]',
      '[1, 2, 3]'
    ].join('\n')
    expect(normalizeMathDelimiters(input)).toBe(input)
  })

  it('protects currency without changing genuine dollar math', () => {
    const input = 'Costs $5, $5.00, $5–$10, or $5 and $10; math is $5 + x$ and $x^2$.'
    expect(normalizeMathDelimiters(input)).toBe(
      'Costs \\$5, \\$5.00, \\$5–\\$10, or \\$5 and \\$10; math is $5 + x$ and $x^2$.'
    )
  })

  it('normalizes the reported integral without deleting content', () => {
    const input = [
      '[ \\iint_R (x^2+y^2)^{3/2},dA ]',
      '[ 0\\le r\\le1,\\qquad -\\frac{\\pi}{2}\\le\\theta\\le\\frac{\\pi}{2} ]',
      '[ \\boxed{\\frac{\\pi}{5}} ]'
    ].join('\n\n')
    const output = normalizeMathDelimiters(input)
    expect(output.match(/\$\$/g)).toHaveLength(6)
    expect(output).toContain('\\iint_R')
    expect(output).toContain('\\boxed{\\frac{\\pi}{5}}')
  })
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx vitest run tests/math.test.ts`

Expected: FAIL because `src/renderer/math.ts` does not exist.

- [ ] **Step 3: Implement code-span isolation and slash delimiter conversion**

Create `src/renderer/math.ts` with a scanner that counts consecutive backticks, copies through the next equal-length delimiter, and applies transformations only to intervening prose. Use `isEscaped(source, index)` to count preceding backslashes. For each unescaped `\(` or `\[`, find the next unescaped matching `\)` or `\]`; if no close exists, preserve the original source.

```ts
function isEscaped(value: string, index: number): boolean {
  let slashes = 0
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i -= 1) slashes += 1
  return slashes % 2 === 1
}

function countRun(value: string, index: number, char: string): number {
  let end = index
  while (value[end] === char) end += 1
  return end - index
}

function mapOutsideCode(value: string, transform: (text: string) => string): string {
  let output = ''
  let plainStart = 0
  let index = 0
  while (index < value.length) {
    if (value[index] !== '`') { index += 1; continue }
    const run = countRun(value, index, '`')
    const marker = '`'.repeat(run)
    const close = value.indexOf(marker, index + run)
    if (close < 0) break
    output += transform(value.slice(plainStart, index))
    output += value.slice(index, close + run)
    index = close + run
    plainStart = index
  }
  return output + transform(value.slice(plainStart))
}
```

Implement `normalizeSlashDelimiters` as a character scanner using `isEscaped`, mapping inline bodies to `$body$` and display bodies to `$$body$$`.

- [ ] **Step 4: Implement conservative bracket and currency handling**

For bracket blocks, split prose into lines. Convert a whole line only when trimmed text starts `[` and ends `]`, the body contains `/\\[A-Za-z]+|\\[{}_,;!:]/`, and nothing follows the closing bracket. Also convert a block whose opening and closing lines trim exactly to `[` and `]` when the joined body matches the same LaTeX-command test.

For currency, scan unescaped single dollars that are immediately followed by a digit. Preserve the dollar as math only when a later single unescaped dollar on the same line is not followed by a digit; otherwise output `\\$`. Always leave `$$`, already escaped dollars, and nonnumeric dollar starts unchanged.

Export the pipeline in this order:

```ts
export function normalizeMathDelimiters(markdown: string): string {
  return mapOutsideCode(markdown, (text) =>
    escapeCurrencyDollars(normalizeBracketBlocks(normalizeSlashDelimiters(text)))
  )
}
```

- [ ] **Step 5: Run the focused tests and typecheck**

Run: `npx vitest run tests/math.test.ts`

Expected: all normalizer tests PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the normalizer**

```bash
git add src/renderer/math.ts tests/math.test.ts
git commit -m "feat: normalize common math delimiters safely"
```

### Task 2: Render normalized math through KaTeX

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/renderer/components/MarkdownAnswer.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/math.test.ts`

**Interfaces:**
- Consumes: `normalizeMathDelimiters(markdown)`.
- Produces: `MarkdownAnswer({ answer }: { answer: string })`, configured with `remarkMath` and `rehypeKatex` using `{ trust: false, throwOnError: false }`.

- [ ] **Step 1: Install local math-rendering dependencies**

Run: `npm install remark-math rehype-katex katex`

Expected: `package.json` and `package-lock.json` add all three runtime dependencies with no peer-dependency errors.

- [ ] **Step 2: Add failing server-render integration tests**

Extend the imports and append to `tests/math.test.ts`:

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownAnswer } from '../src/renderer/components/MarkdownAnswer'

function renderMath(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownAnswer, { answer: markdown }))
}

it('renders the reported integral and boxed answer as KaTeX with MathML', () => {
  const html = renderMath([
    '[ \\iint_R (x^2+y^2)^{3/2}\\,dA ]',
    '[ \\boxed{\\frac{\\pi}{5}} ]'
  ].join('\n\n'))
  expect(html).toContain('class="katex-display"')
  expect(html).toContain('<math')
  expect(html).toContain('∬')
  expect(html).toContain('π')
})

it('renders multiline environments and retains malformed source nonfatally', () => {
  const valid = renderMath('\\[\\begin{cases}x^2 & x>0\\\\0 & x\\le0\\end{cases}\\]')
  expect(valid).toContain('class="katex-display"')
  const malformed = renderMath('$$\\frac{1}{$$')
  expect(malformed).toContain('katex-error')
  expect(malformed).toContain('\\frac')
})

it.each([
  '$\\sum_{n=1}^{\\infty} n^{-2}$',
  '$\\sqrt{x^2+y^2}$',
  '$\\lim_{x\\to0} \\frac{\\sin x}{x}$',
  '$\\alpha+\\beta+\\theta$',
  '$$\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$$',
  '$$\\begin{gathered}a=b\\\\c=d\\end{gathered}$$'
])('renders representative KaTeX input: %s', (source) => {
  expect(renderMath(source)).toContain('class="katex')
})
```

- [ ] **Step 3: Run the integration tests and verify they fail before wiring**

Run: `npx vitest run tests/math.test.ts`

Expected: FAIL because `MarkdownAnswer` does not exist.

- [ ] **Step 4: Wire KaTeX into the answer renderer**

Create `src/renderer/components/MarkdownAnswer.tsx`:

```tsx
import Markdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeMathDelimiters } from '../math'

export function MarkdownAnswer({ answer }: { answer: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { trust: false, throwOnError: false }]]}
      components={{
        a: ({ href, children }) => (
          <a href="#" onClick={(event) => {
            event.preventDefault()
            if (href) window.ghost.openExternal(href)
          }}>{children}</a>
        )
      }}
    >
      {normalizeMathDelimiters(answer)}
    </Markdown>
  )
}
```

In `App.tsx`, remove the direct `react-markdown` import, import `MarkdownAnswer`, and replace the current inline `<Markdown>` block with `<MarkdownAnswer answer={answer} />`.

- [ ] **Step 5: Add narrow-panel math styles**

Append focused styles to `src/renderer/styles.css`:

```css
.panel-body .katex { color: inherit; }
.panel-body .katex-display {
  margin: 0.7em 0;
  padding: 0.15em 0;
  overflow-x: auto;
  overflow-y: hidden;
}
.panel-body .katex-display > .katex { min-width: max-content; }
.panel-body .katex-error {
  color: #ffb4b4;
  overflow-wrap: anywhere;
  white-space: normal;
}
```

- [ ] **Step 6: Run focused tests, full tests, and typecheck**

Run: `npx vitest run tests/math.test.ts`

Expected: all normalization and KaTeX integration tests PASS.

Run: `npm test`

Expected: all TypeScript tests PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the renderer integration**

```bash
git add package.json package-lock.json src/renderer/components/MarkdownAnswer.tsx src/renderer/App.tsx src/renderer/styles.css tests/math.test.ts
git commit -m "feat: render assistant math with KaTeX"
```

### Task 3: Give both providers canonical math-format guidance

**Files:**
- Create: `src/main/response-guidance.ts`
- Modify: `src/main/claude.ts`
- Modify: `src/main/openai.ts`
- Modify: `tests/claude.test.ts`
- Modify: `tests/openai.test.ts`

**Interfaces:**
- Produces: `MATH_FORMATTING_GUIDANCE: string`.
- Produces: `withResponseGuidance(prompt: string): string` for Codex user prompts.
- Claude consumes the same constant in `SYSTEM_PROMPT`.

- [ ] **Step 1: Write failing shared-guidance tests**

In `tests/claude.test.ts`, capture spawned arguments and assert the `--append-system-prompt` value contains both `$...$` and `$$...$$` instructions. In `tests/openai.test.ts`, change the final prompt expectation to call `withResponseGuidance('Explain this')` and assert the string contains the original request after the math rules.

```ts
expect(systemPrompt).toContain('Use `$...$` for inline math')
expect(systemPrompt).toContain('Use `$$...$$` for display math')
expect(withResponseGuidance('Explain this')).toContain('User request:\nExplain this')
```

- [ ] **Step 2: Run provider tests and verify they fail**

Run: `npx vitest run tests/claude.test.ts tests/openai.test.ts`

Expected: FAIL because the shared guidance module and assertions are not satisfied.

- [ ] **Step 3: Add the shared guidance and wire both providers**

```ts
export const MATH_FORMATTING_GUIDANCE = [
  'Math formatting:',
  '- Use `$...$` for inline math.',
  '- Use `$$...$$` for display math.',
  '- Put multiline equations inside a KaTeX-supported environment within `$$...$$`.',
  '- Use valid LaTeX spacing such as `\\,dA`; do not wrap equations in bare square brackets.'
].join('\n')

export function withResponseGuidance(prompt: string): string {
  return `${MATH_FORMATTING_GUIDANCE}\n\nUser request:\n${prompt}`
}
```

Import and append `MATH_FORMATTING_GUIDANCE` to Claude's existing `SYSTEM_PROMPT`. In `buildCodexArgs`, pass `withResponseGuidance(input.prompt)` after `--`; keep `--image` before `--` so the previous image-prompt fix remains intact.

- [ ] **Step 4: Run provider tests and typecheck**

Run: `npx vitest run tests/claude.test.ts tests/openai.test.ts`

Expected: PASS, including the existing image argument order test.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit provider guidance**

```bash
git add src/main/response-guidance.ts src/main/claude.ts src/main/openai.ts tests/claude.test.ts tests/openai.test.ts
git commit -m "feat: request canonical math formatting"
```

### Task 4: Package, verify, release, and update the installed app

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/RELEASE_NOTES.md`
- Generated: `release/Ghostpane-0.2.1-arm64.dmg`
- Generated: `release/Ghostpane-0.2.1.dmg`

**Interfaces:**
- Produces: Ghostpane v0.2.1 DMGs and an updated `/Applications/Ghostpane.app`.

- [ ] **Step 1: Bump the patch version and finalize release notes**

Run: `npm version 0.2.1 --no-git-tag-version`

Expected: `package.json` and `package-lock.json` both report `0.2.1`.

Add a v0.2.1 section at the top of `docs/RELEASE_NOTES.md` covering the separate held-audio shortcut, robust local KaTeX rendering, and unchanged `.dmg` installation flow.

- [ ] **Step 2: Run the complete verification matrix**

Run: `npm test`

Expected: all TypeScript tests PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run native:test`

Expected: all Swift tests PASS.

Run: `npm run build`

Expected: native helper and Electron production build succeed.

- [ ] **Step 3: Build Apple Silicon and Intel DMGs**

Run: `npm run dist`

Expected: `release/Ghostpane-0.2.1-arm64.dmg` and `release/Ghostpane-0.2.1.dmg` exist, with both packaged apps signed by the existing local identity/fallback policy.

- [ ] **Step 4: Verify release artifacts**

Run: `scripts/verify-release.sh release/mac-arm64/Ghostpane.app release/Ghostpane-0.2.1-arm64.dmg arm64`

Expected: PASS.

Run: `scripts/verify-release.sh release/mac/Ghostpane.app release/Ghostpane-0.2.1.dmg x64`

Expected: PASS; use `release/mac-x64/Ghostpane.app` if electron-builder names the x64 directory that way.

- [ ] **Step 5: Install and verify the current local app**

Quit the running Ghostpane process, move the existing `/Applications/Ghostpane.app` to a timestamped Trash backup, copy `release/mac-arm64/Ghostpane.app` into `/Applications`, remove quarantine only from that exact app path if present, launch it, and verify:

```bash
defaults read /Applications/Ghostpane.app/Contents/Info.plist CFBundleShortVersionString
codesign --verify --deep --strict /Applications/Ghostpane.app
pgrep -fl '/Applications/Ghostpane.app/Contents/MacOS/Ghostpane'
```

Expected: version `0.2.1`, signature verification succeeds, and one installed-app process is running.

- [ ] **Step 6: Perform focused manual checks**

Confirm `⌘⏎` submits a screenshot-only ask, a short `⌘⇧⏎` submits nothing, a held `⌘⇧⏎` records and submits after release, modifier-first release leaks no newline, and the reported integral plus code/currency/malformed fixtures display safely. If macOS Accessibility permission prevents the real hold, verify the setup fallback and report the manual hold check as permission-blocked rather than claiming it passed.

- [ ] **Step 7: Commit release metadata, push, and publish the DMG release**

```bash
git add package.json package-lock.json docs/RELEASE_NOTES.md
git commit -m "release: prepare v0.2.1"
git push origin codex/audio-chatgpt-hardening
```

Create and push tag `v0.2.1` only after all verification succeeds, then upload both verified DMGs to the GitHub v0.2.1 release using `docs/RELEASE_NOTES.md`. Confirm the release page exposes ordinary downloadable `.dmg` assets for both architectures.
