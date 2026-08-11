// src/components/Cards.jsx
// 思考卡 + 工具卡（P0.7a 从 App.jsx 抽出，供 RunCard 与未来 BlockRenderer 复用）
import { useState, useEffect } from 'react'

export const glassCard = {
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  border: '1px solid var(--color-border-glass)',
  background: 'var(--color-card-glass)',
  backdropFilter: 'blur(20px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
  boxShadow: 'var(--shadow-soft)',
  maxWidth: '75%',
}

// —— 思考卡片（暖白饱和玻璃）：思考中渐变预览，完成后收起成一行，点击展开 ——
export const ThinkingCard = ({ text, done, dur }) => {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (done) setOpen(false) }, [done])
  const showBody = open || !done
  const isPreview = !done
  return (
    <div style={glassCard} className="tool-card status-thinking">
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-gray)', userSelect: 'none' }}>
        <span style={{ fontSize: 13 }}>💡</span>
        <span>{done ? (dur ? `深度思考 · ${(dur / 1000).toFixed(1)}s` : '深度思考') : '思考中…'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>{done ? (open ? '▲' : '▼') : ''}</span>
      </div>
      {showBody && (
        <div style={{
          padding: '0 14px 10px', maxHeight: isPreview ? 120 : 320, overflowY: 'auto', fontSize: 12, lineHeight: 1.7,
          color: 'var(--color-text-gray)', whiteSpace: 'pre-wrap',
          borderTop: '1px solid var(--color-border-glass)',
          maskImage: isPreview ? 'linear-gradient(to bottom, black 55%, transparent 100%)' : 'none',
          WebkitMaskImage: isPreview ? 'linear-gradient(to bottom, black 55%, transparent 100%)' : 'none',
        }}>{text}</div>
      )}
    </div>
  )
}

// —— 工具卡片（暖白饱和玻璃）：执行中展开，完成后自动折叠，点击展开详情 ——
export const ToolCard = ({ tool, result }) => {
  const [open, setOpen] = useState(false)
  const isError = !!result && String(result).startsWith('执行失败')
  const isRunning = result === undefined || result === ''
  const icon = tool.name === 'read_file' ? '📖' : tool.name === 'write_file' ? '✏️' : tool.name === 'list_files' ? '📁' : tool.name === 'read_memories' ? '🧠' : tool.name === 'write_memory' ? '📝' : '⚙️'
  const showBody = open || isRunning
  return (
    <div style={{ ...glassCard, marginBottom: 6 }} className={`tool-card ${isRunning ? 'status-thinking' : isError ? 'status-err' : 'status-ok'}`}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>
        <span className="tool-icon" style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ color: 'var(--color-text-dark)', fontWeight: 600 }}>{tool.name}</span>
        {tool.arguments?.path && <span style={{ color: 'var(--color-text-gray)', fontSize: 11 }}>{tool.arguments.path}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12 }}>
          {isRunning ? <span style={{ color: '#C08B5E' }}>⏳</span> : isError ? <span style={{ color: '#D97777' }}>❌</span> : <span style={{ color: '#7D9B76' }}>✅</span>}
        </span>
      </div>
      {showBody && (
        <div style={{
          padding: '0 14px 10px', maxHeight: 220, overflowY: 'auto', fontSize: 11, lineHeight: 1.7,
          color: isError ? 'var(--color-danger)' : 'var(--color-text-gray)', whiteSpace: 'pre-wrap',
          borderTop: '1px solid var(--color-border-glass)', opacity: isRunning ? 0.7 : 1,
        }}>{result || '执行中…'}</div>
      )}
    </div>
  )
}
