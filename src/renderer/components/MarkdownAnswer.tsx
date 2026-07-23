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
