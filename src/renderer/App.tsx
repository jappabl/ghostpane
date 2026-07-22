import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { CameraIcon } from './components/Icons'
import { MODELS, type AppConfig } from '../shared/ipc'

// Cap the overlay at ~85% of the screen; taller answers scroll inside.
const MAX_H = Math.floor((window.screen?.availHeight ?? 900) * 0.85)

export function App() {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState('')
  const [config, setConfig] = useState<AppConfig>({ model: '', logPath: '' })
  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastH = useRef(0)

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
    window.ghost.onAnswerChunk((c) => { setAnswer((a) => a + c.text); setThinking(false) })
    window.ghost.onAnswerDone(() => setThinking(false))
    window.ghost.onAnswerError((e) => { setError(e.message); setThinking(false) })
    window.ghost.onConfig((c) => setConfig(c))
    window.ghost.onMainEvent((e) => {
      if (e === 'focus-input') inputRef.current?.focus()
      if (e === 'scroll-up') bodyRef.current?.scrollBy({ top: -140 })
      if (e === 'scroll-down') bodyRef.current?.scrollBy({ top: 140 })
    })
  }, [])

  // Follow the stream: keep the newest text in view.
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [answer])

  const hasBody = Boolean(answer || thinking || error)

  function beginAsk(withScreenshot: boolean) {
    if (!withScreenshot && !prompt.trim()) return
    setAnswer(''); setError(''); setThinking(true)
    window.ghost.ask({ prompt, withScreenshot })
    setPrompt('') // clear the box so it's ready for the next question
  }

  return (
    <div className="root" ref={rootRef} style={{ maxHeight: MAX_H }}>
      <div className="bar glass">
        <span className={'dot' + (thinking ? ' live' : '')} />
        <input
          ref={inputRef}
          className="ask"
          placeholder="Ask anything…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') beginAsk(false) }}
        />
        <div className="bar-actions">
          <select
            className="model"
            title="Model"
            value={config.model}
            onChange={(e) => window.ghost.setModel(e.target.value)}
          >
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <span className="sep" />
          <button className="iconbtn" title="Screenshot & ask (⌘⏎)" onClick={() => beginAsk(true)}>
            <CameraIcon />
          </button>
          <kbd className="kbd">⌘⏎</kbd>
        </div>
      </div>

      {hasBody && (
        <div className="panel glass">
          <div className="panel-body" ref={bodyRef}>
            {error
              ? <div className="error">
                  <div className="error-msg">{error}</div>
                  <div className="error-log">Logs: {config.logPath || '~/Library/Logs/Ghostpane'} · press ⌘⇧L to open</div>
                </div>
              : thinking && !answer
                ? <div className="thinking"><span className="d" /><span className="d" /><span className="d" /> Thinking…</div>
                : <Markdown>{answer}</Markdown>}
          </div>
          <div className="panel-foot">
            <span>⌘\ hide</span>
            <span>⌘↑ ⌘↓ scroll</span>
            <span>⌘⇧\ click-through</span>
            <span>⌘⇧L logs</span>
          </div>
        </div>
      )}
    </div>
  )
}
