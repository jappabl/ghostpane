// Providers stream text a token at a time. Rendering markdown per token is
// quadratic — each chunk re-parses the whole answer so far, re-runs KaTeX,
// rebuilds the DOM, and (via the ResizeObserver) resizes the native window.
// Buffering chunks into one update per frame-ish window keeps that work, and
// the garbage it produces, proportional to the answer rather than its square.
export class ChunkCoalescer {
  private pending = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly flushMs: number,
    private readonly onFlush: (text: string) => void
  ) {}

  push(text: string): void {
    this.pending += text
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.flushMs)
    }
  }

  flush(): void {
    this.cancel()
    if (!this.pending) return
    const text = this.pending
    this.pending = ''
    this.onFlush(text)
  }

  reset(): void {
    this.cancel()
    this.pending = ''
  }

  private cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
