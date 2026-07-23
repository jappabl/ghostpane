const LATEX_COMMAND = /\\(?:[A-Za-z]+|[{}_,;!:])/

function isEscaped(value: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashes += 1
  }
  return slashes % 2 === 1
}

function countRun(value: string, index: number, char: string): number {
  let end = index
  while (value[end] === char) end += 1
  return end - index
}

function findCodeClose(value: string, start: number, char: string, run: number): number {
  let cursor = start
  while (cursor < value.length) {
    const next = value.indexOf(char, cursor)
    if (next < 0) return -1
    const nextRun = countRun(value, next, char)
    if (nextRun === run || (run >= 3 && nextRun > run)) return next
    cursor = next + nextRun
  }
  return -1
}

function mapOutsideCode(value: string, transform: (text: string) => string): string {
  let output = ''
  let plainStart = 0
  let index = 0

  while (index < value.length) {
    const char = value[index]
    const run = char === '`' || char === '~' ? countRun(value, index, char) : 0
    const isCodeDelimiter = char === '`' || (char === '~' && run >= 3)
    if (!isCodeDelimiter) {
      index += 1
      continue
    }

    const close = findCodeClose(value, index + run, char, run)
    if (close < 0) break
    const closeRun = countRun(value, close, char)
    output += transform(value.slice(plainStart, index))
    output += value.slice(index, close + closeRun)
    index = close + closeRun
    plainStart = index
  }

  return output + transform(value.slice(plainStart))
}

function findUnescaped(value: string, token: string, start: number): number {
  let cursor = start
  while (cursor < value.length) {
    const next = value.indexOf(token, cursor)
    if (next < 0) return -1
    if (!isEscaped(value, next)) return next
    cursor = next + token.length
  }
  return -1
}

function normalizeSlashDelimiters(value: string): string {
  let output = ''
  let index = 0

  while (index < value.length) {
    const next = value[index + 1]
    if (value[index] !== '\\' || isEscaped(value, index) || (next !== '(' && next !== '[')) {
      output += value[index]
      index += 1
      continue
    }

    const closeToken = next === '(' ? '\\)' : '\\]'
    const close = findUnescaped(value, closeToken, index + 2)
    if (close < 0) {
      output += value[index]
      index += 1
      continue
    }

    const delimiter = next === '(' ? '$' : '$$'
    output += delimiter + value.slice(index + 2, close) + delimiter
    index = close + closeToken.length
  }

  return output
}

function normalizeBracketBlocks(value: string): string {
  const lines = value.split('\n')
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const indentation = line.slice(0, line.length - line.trimStart().length)

    if (trimmed === '[') {
      let close = index + 1
      while (close < lines.length && lines[close].trim() !== ']') close += 1
      if (close < lines.length) {
        const body = lines.slice(index + 1, close).join('\n')
        if (LATEX_COMMAND.test(body)) {
          output.push(`${indentation}$$`, ...lines.slice(index + 1, close), `${indentation}$$`)
          index = close
          continue
        }
      }
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const body = trimmed.slice(1, -1).trim()
      if (LATEX_COMMAND.test(body)) {
        output.push(`${indentation}$$${body}$$`)
        continue
      }
    }

    output.push(line)
  }

  return output.join('\n')
}

function isSingleDollar(value: string, index: number): boolean {
  return value[index] === '$' && value[index - 1] !== '$' && value[index + 1] !== '$' &&
    !isEscaped(value, index)
}

function findNextSingleDollarOnLine(value: string, start: number): number {
  for (let index = start; index < value.length && value[index] !== '\n'; index += 1) {
    if (isSingleDollar(value, index)) return index
  }
  return -1
}

function looksLikeNumericMath(body: string): boolean {
  const trimmed = body.trim()
  return /^\d+(?:\.\d+)?$/.test(trimmed) ||
    /[=+*/^_{}<>]|\\[A-Za-z]+/.test(trimmed) ||
    /^\d+(?:\.\d+)?[A-Za-z]+$/.test(trimmed)
}

function escapeCurrencyDollars(value: string): string {
  let output = ''

  for (let index = 0; index < value.length; index += 1) {
    if (!isSingleDollar(value, index) || !/\d/.test(value[index + 1] ?? '')) {
      output += value[index]
      continue
    }

    const close = findNextSingleDollarOnLine(value, index + 1)
    const hasMathClose = close >= 0 &&
      !/\d/.test(value[close + 1] ?? '') &&
      looksLikeNumericMath(value.slice(index + 1, close))
    output += hasMathClose ? '$' : '\\$'
  }

  return output
}

export function normalizeMathDelimiters(markdown: string): string {
  return mapOutsideCode(markdown, (text) =>
    escapeCurrencyDollars(normalizeBracketBlocks(normalizeSlashDelimiters(text)))
  )
}
