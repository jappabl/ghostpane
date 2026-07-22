import Markdown from 'react-markdown'

export function Answer({ text, status, error }: { text: string; status: string; error: string }) {
  return (
    <div className="answer">
      {error ? <div className="error">{error}</div> : <Markdown>{text}</Markdown>}
      {status && !error ? <div className="status">{status}</div> : null}
    </div>
  )
}
