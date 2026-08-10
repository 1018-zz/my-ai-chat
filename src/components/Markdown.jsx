// src/components/Markdown.jsx
// AI 回复的 markdown 渲染组件（react-markdown 封装）
import ReactMarkdown from 'react-markdown'

const Markdown = ({ children }) => (
  <div className="md-body">
    <ReactMarkdown
      components={{
        p: ({ children }) => <p style={{ margin: '6px 0' }}>{children}</p>,
        h1: ({ children }) => <h1 style={{ fontSize: 18, margin: '10px 0 6px' }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: 16, margin: '10px 0 6px' }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: 14, margin: '8px 0 4px' }}>{children}</h3>,
        ul: ({ children }) => <ul style={{ margin: '6px 0', paddingLeft: 20 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '6px 0', paddingLeft: 20 }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        blockquote: ({ children }) => (
          <blockquote style={{ margin: '8px 0', padding: '4px 12px', borderLeft: '3px solid var(--color-primary, #c08b72)', color: 'var(--color-text-gray)', background: 'rgba(255,255,255,0.04)', borderRadius: '0 8px 8px 0' }}>{children}</blockquote>
        ),
        code: ({ node, children }) => {
          const isBlock = node && node.position && node.position.start.line !== node.position.end.line
          return isBlock
            ? <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.6 }}>{children}</code>
            : <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: '0.88em' }}>{children}</code>
        },
        pre: ({ children }) => (
          <pre style={{ background: '#0d0f12', padding: 12, borderRadius: 8, overflowX: 'auto', margin: '8px 0', fontSize: 12, lineHeight: 1.6 }}>{children}</pre>
        ),
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>{children}</a>,
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--color-border, #333)', margin: '10px 0' }} />,
        table: ({ children }) => <table style={{ borderCollapse: 'collapse', margin: '8px 0', fontSize: 13 }}>{children}</table>,
        th: ({ children }) => <th style={{ border: '1px solid var(--color-border, #333)', padding: '4px 8px', textAlign: 'left' }}>{children}</th>,
        td: ({ children }) => <td style={{ border: '1px solid var(--color-border, #333)', padding: '4px 8px' }}>{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  </div>
)

export default Markdown
