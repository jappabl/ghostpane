import { useEffect, useRef, useState } from 'react'
import { Answer } from './components/Answer'

export function App() {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.ghost.onAnswerChunk((c) => { setAnswer((a) => a + c.text); setStatus('') })
    window.ghost.onAnswerDone(() => setStatus(''))
    window.ghost.onAnswerError((e) => { setError(e.message); setStatus('') })
    window.ghost.onMainEvent((e) => {
      if (e === 'focus-input') inputRef.current?.focus()
      if (e === 'scroll-up') answerRef.current?.scrollBy({ top: -120 })
      if (e === 'scroll-down') answerRef.current?.scrollBy({ top: 120 })
    })
  }, [])

  function beginAsk(withScreenshot: boolean) {
    setAnswer(''); setError(''); setStatus('Thinking…')
    window.ghost.ask({ prompt, withScreenshot })
  }

  return (
    <div className="app">
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
      <div ref={answerRef} style={{ flex: 1, overflow: 'auto' }}>
        <Answer text={answer} status={status} error={error} />
      </div>
      <div className="hint">⌘\ toggle · ⌘⏎ screenshot+ask · ⌘⇧Space focus · ⌘⇧\ click-through</div>
    </div>
  )
}
