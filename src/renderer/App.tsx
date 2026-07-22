import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Answer } from './components/Answer'

// Cap the overlay at ~85% of the screen; taller answers scroll inside.
const MAX_H = Math.floor((window.screen?.availHeight ?? 900) * 0.85)

export function App() {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const lastH = useRef(0)

  // Report the app's natural height to main so the window fits the content.
  useLayoutEffect(() => {
    const el = appRef.current
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
    window.ghost.onAnswerChunk((c) => { setAnswer((a) => a + c.text); setStatus('') })
    window.ghost.onAnswerDone(() => setStatus(''))
    window.ghost.onAnswerError((e) => { setError(e.message); setStatus('') })
    window.ghost.onMainEvent((e) => {
      if (e === 'focus-input') inputRef.current?.focus()
      if (e === 'scroll-up') answerRef.current?.scrollBy({ top: -140 })
      if (e === 'scroll-down') answerRef.current?.scrollBy({ top: 140 })
    })
  }, [])

  // Follow the stream: keep the newest text in view as it arrives.
  useEffect(() => {
    const el = answerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [answer])

  const hasBody = Boolean(answer || status || error)

  function beginAsk(withScreenshot: boolean) {
    setAnswer(''); setError(''); setStatus('Thinking…')
    window.ghost.ask({ prompt, withScreenshot })
  }

  return (
    <div className="app" ref={appRef} style={{ maxHeight: MAX_H }}>
      <div className="row">
        <input
          ref={inputRef}
          className="input"
          placeholder="Ask Claude… (Enter to send)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') beginAsk(false) }}
        />
        <button className="btn" onClick={() => beginAsk(true)}>Shot+Ask</button>
      </div>
      {hasBody && (
        <div className="answer-wrap" ref={answerRef}>
          <Answer text={answer} status={status} error={error} />
        </div>
      )}
      <div className="hint">⌘\ toggle · ⌘⏎ screenshot+ask · ⌘⇧Space focus · ⌘⇧\ click-through</div>
    </div>
  )
}
