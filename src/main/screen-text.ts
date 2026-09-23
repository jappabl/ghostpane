import type { TextLine } from './native-helper'

// OCR returns loose, positioned lines. A text-only model needs them back as
// text it can follow: in reading order, one column at a time, with code keeping
// its indentation. This is a recursive XY-cut: split the region at its widest
// clean gap — a gutter between columns or a space between rows — and recurse.

// Narrowest horizontal gap (fraction of screen width) treated as a column gutter
// rather than the space between two words.
const COLUMN_GUTTER = 0.02
const MAX_INDENT = 40

interface Box { text: string; left: number; right: number; top: number; bottom: number }
interface Metrics { charWidth: number; lineHeight: number }
interface Gap { size: number; at: number }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
}

const minLeft = (boxes: Box[]) => Math.min(...boxes.map((b) => b.left))

// Typical character width, used to turn a line's offset into indentation. Taken
// per column: code beside prose is set in a wider font.
const charWidthOf = (boxes: Box[]) => median(boxes.map((b) => (b.right - b.left) / b.text.length))

// Widest gap along one axis that no box crosses.
function widestGap(boxes: Box[], start: (b: Box) => number, end: (b: Box) => number): Gap | null {
  const sorted = [...boxes].sort((a, b) => start(a) - start(b))
  let reach = end(sorted[0])
  let best: Gap | null = null
  for (const box of sorted.slice(1)) {
    const gap = start(box) - reach
    if (gap > 0 && (!best || gap > best.size)) best = { size: gap, at: start(box) }
    reach = Math.max(reach, end(box))
  }
  return best
}

function groupRows(boxes: Box[]): Box[][] {
  const rows: Array<{ boxes: Box[]; top: number; bottom: number }> = []
  const byCenter = [...boxes].sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom))
  for (const box of byCenter) {
    const center = (box.top + box.bottom) / 2
    const row = rows[rows.length - 1]
    if (row && center >= row.top && center <= row.bottom) {
      row.boxes.push(box)
      row.top = Math.min(row.top, box.top)
      row.bottom = Math.max(row.bottom, box.bottom)
    } else {
      rows.push({ boxes: [box], top: box.top, bottom: box.bottom })
    }
  }
  return rows.map((row) => row.boxes.sort((a, b) => a.left - b.left))
}

function renderRow(row: Box[], columnLeft: number, m: Metrics): string {
  let text = row[0].text
  for (let i = 1; i < row.length; i++) {
    text += (row[i].left - row[i - 1].right >= COLUMN_GUTTER ? '    ' : ' ') + row[i].text
  }
  const indent = m.charWidth > 0 ? Math.round((row[0].left - columnLeft) / m.charWidth) : 0
  return ' '.repeat(Math.min(MAX_INDENT, Math.max(0, indent))) + text
}

function cut(boxes: Box[], columnLeft: number, m: Metrics, out: string[]): void {
  const rows = groupRows(boxes)
  if (rows.length === 1) { out.push(renderRow(rows[0], columnLeft, m)); return }

  const across = widestGap(boxes, (b) => b.left, (b) => b.right)
  const down = widestGap(boxes, (b) => b.top, (b) => b.bottom)

  if (across && across.size >= COLUMN_GUTTER && (!down || across.size >= down.size)) {
    // Side-by-side columns: all of the left one, then the right. Indentation is
    // measured from each column's own left edge.
    const left = boxes.filter((b) => b.left < across.at)
    const right = boxes.filter((b) => b.left >= across.at)
    cut(left, minLeft(left), { ...m, charWidth: charWidthOf(left) }, out)
    out.push('')
    cut(right, minLeft(right), { ...m, charWidth: charWidthOf(right) }, out)
    return
  }
  if (down) {
    cut(boxes.filter((b) => b.top < down.at), columnLeft, m, out)
    if (down.size > m.lineHeight) out.push('') // a paragraph break, not line spacing
    cut(boxes.filter((b) => b.top >= down.at), columnLeft, m, out)
    return
  }
  // Rows that overlap with no clean cut between them: emit them in order.
  for (const row of rows) out.push(renderRow(row, columnLeft, m))
}

export function layoutScreenText(lines: TextLine[]): string {
  const boxes: Box[] = lines
    .filter((line) => line.text.trim())
    .map((line) => ({
      text: line.text.trim(),
      left: line.x,
      right: line.x + line.width,
      top: line.y,
      bottom: line.y + line.height
    }))
  if (!boxes.length) return ''
  const metrics: Metrics = {
    charWidth: charWidthOf(boxes),
    lineHeight: median(boxes.map((b) => b.bottom - b.top))
  }
  const out: string[] = []
  cut(boxes, minLeft(boxes), metrics, out)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
