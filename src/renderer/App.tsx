import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MarkdownAnswer } from './components/MarkdownAnswer'
import { ChunkCoalescer } from './chunk-coalescer'
import { presentAnswer } from './choice-answer'
import type { AnswerMode } from '../shared/ipc'

// Cap the overlay at ~85% of the screen; taller answers scroll inside.
const MAX_H = Math.floor((window.screen?.availHeight ?? 900) * 0.85)
// One answer update per ~60ms instead of one per streamed token. Still reads
// as live streaming; keeps markdown parsing, KaTeX and window resizes linear.
const STREAM_FLUSH_MS = 60

export function App() {
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(false)
  const [mode, setMode] = useState<AnswerMode>('letter')
  const [error, setError] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastH = useRef(0)
  const streamRef = useRef<ChunkCoalescer | null>(null)
  if (!streamRef.current) {
    streamRef.current = new ChunkCoalescer(STREAM_FLUSH_MS, (text) => setAnswer((a) => a + text))
  }

  // Report the content height to main so the window fits the floating pieces.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const report = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (Math.abs(h - lastH.current) > 1) { lastH.current = h; window.ghost.resize(h) }
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const stream = streamRef.current!
    window.ghost.onAnswerChunk((c) => stream.push(c.text))
    // Flush the tail the buffer is still holding before the answer settles.
    window.ghost.onAnswerDone(() => { stream.flush(); setDone(true) })
    window.ghost.onAnswerError((e) => { stream.reset(); setError(e.message) })
    // A new status from main means a new ask: start a fresh answer.
    window.ghost.onStatus((s) => { if (s) { stream.reset(); setAnswer(''); setDone(false); setError('') } })
    window.ghost.onAnswerMode(setMode)
    window.ghost.onMainEvent((e) => {
      if (e === 'scroll-up') bodyRef.current?.scrollBy({ top: -140 })
      if (e === 'scroll-down') bodyRef.current?.scrollBy({ top: 140 })
    })
    return () => stream.reset()
  }, [])

  // Follow the stream: keep the newest text in view.
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [answer])

  // Nothing but the answer (or an error) is ever drawn.
  // A multiple-choice answer shows only its letter (⌘⏎) or the full worked answer (⌘]).
  const view = presentAnswer(answer, done, mode)
  const hasBody = Boolean(error || view.kind !== 'pending')

  return (
    <div className="root" ref={rootRef} style={{ maxHeight: MAX_H }}>
      {hasBody && (
        <div className="panel surface">
          <div className="panel-body" ref={bodyRef}>
            {error
              ? <div className="error-msg">{error}</div>
              : view.kind === 'letter'
                ? <div className="choice-letter">{view.letter}</div>
                : view.kind === 'text' && <MarkdownAnswer answer={view.text} />}
          </div>
        </div>
      )}
    </div>
  )
}
