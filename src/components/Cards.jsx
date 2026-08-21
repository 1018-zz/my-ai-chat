// src/components/Cards.jsx
// 思考卡 + 工具卡（P0.7a 从 App.jsx 抽出，供 RunCard 与未来 BlockRenderer 复用）
import { useState, useEffect } from 'react'
import { ToolTypeIcon, StatusIcon, SproutIcon, LightbulbIcon, Copy } from './icons'

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

// 韩系手帐纸感卡片：暖纸渐变 + 单层柔和阴影 + 暖色描边（与 ToolGroupCard 一致，已收紧）
export const paperCard = {
  maxWidth: '75%',
  borderRadius: 10,
  border: '1px solid rgba(201,184,166,0.35)',
  background: 'linear-gradient(180deg, #FFF9EF 0%, #F6EDDA 100%)',
  boxShadow: '0 2px 8px rgba(80,60,40,0.08)',
}

// —— 思考卡片（暖纸手帐风）：运行中一行状态（不预览内容），完成后收起成一行，点击展开 ——
export const ThinkingCard = ({ text, done, dur }) => {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (done) setOpen(false) }, [done])
  const showBody = open
  return (
    <div style={paperCard} className="tool-card status-thinking">
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-gray)', userSelect: 'none' }}>
        <span style={{ fontSize: 14, color: 'var(--color-primary)', display: 'inline-flex' }}><LightbulbIcon /></span>
        <span>{done ? (dur ? `深度思考 · ${(dur / 1000).toFixed(1)}s` : '深度思考') : <span><SproutIcon style={{ fontSize: 13, marginRight: 3 }} />正在整理想法<span className="thinking-dot" /></span>}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>{done ? (open ? '▲' : '▼') : ''}</span>
      </div>
      {showBody && (
        <div style={{
          padding: '0 14px 10px', maxHeight: 320, overflowY: 'auto', fontSize: 12, lineHeight: 1.7,
          color: 'var(--color-text-gray)', whiteSpace: 'pre-wrap',
          borderTop: '1px solid var(--color-border-glass)',
        }}>{text}</div>
      )}
    </div>
  )
}

// 由文件路径后缀推断语言标签（用于代码块右上角徽标）
const CODE_LANG = {
  js: 'JS', jsx: 'JSX', ts: 'TS', tsx: 'TSX', mjs: 'JS', cjs: 'JS',
  py: 'PY', pyw: 'PY', rb: 'RB', go: 'GO', rs: 'RS',
  java: 'JAVA', c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++',
  css: 'CSS', scss: 'SCSS', less: 'LESS', html: 'HTML', htm: 'HTML', vue: 'VUE', svelte: 'SVELTE',
  json: 'JSON', md: 'MD', markdown: 'MD', sql: 'SQL', sh: 'SH', bash: 'SH', zsh: 'SH',
  yml: 'YAML', yaml: 'YAML', toml: 'TOML', xml: 'XML', svg: 'SVG', txt: 'TXT', log: 'LOG',
}
function langFromPath(path) {
  if (!path) return ''
  const m = String(path).toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!m) return ''
  return CODE_LANG[m[1]] || m[1].toUpperCase()
}

// —— 工具卡片（暖白饱和玻璃）：运行中只显头部状态，完成后自动折叠，点击展开详情 ——
// 读写代码（read_file/write_file）结果用深色等宽代码块渲染，默认展开、不折行、可横向滚动
export const ToolCard = ({ tool, result }) => {
  const isError = !!result && String(result).startsWith('执行失败')
  const isRunning = result === undefined || result === ''
  const isCode = tool.name === 'read_file' || tool.name === 'write_file'
  const lang = isCode ? langFromPath(tool.arguments?.path) : ''
  const [open, setOpen] = useState(isCode)
  const [copied, setCopied] = useState(false)
  const showBody = open

  // 分享卡片：钟泽 share_item 调用的东西渲染成"礼物"，不是工具卡片
  if (tool.name === 'share_item') {
    const s = tool.arguments || {}
    const kindIcon = s.kind === 'music' ? '🎵' : s.kind === 'video' ? '🎬' : s.kind === 'image' ? '🖼️' : '🔗'
    const kindLabel = s.kind === 'music' ? '他放了一首歌' : s.kind === 'video' ? '他留下一段视频' : s.kind === 'image' ? '他递来一张图' : '他分享了一个链接'
    return (
      <div style={{ ...paperCard, marginBottom: 6, overflow: 'hidden' }} className="tool-card status-ok share-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', fontSize: 12, color: 'var(--color-text-gray)' }}>
          <span style={{ fontSize: 13 }}>{kindIcon}</span>
          <span>{kindLabel}</span>
        </div>
        <div style={{ padding: '2px 12px 10px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-dark)', marginBottom: 2 }}>{s.title || '（无标题）'}</div>
          {s.description && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{s.description}</div>}
          {s.cover && <img src={s.cover} alt={s.title || '分享'} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} onError={e => { e.target.style.display = 'none' }} />}
          {s.embed
            ? <iframe src={s.embed} style={{ width: '100%', height: s.kind === 'video' ? 200 : 90, border: 0, borderRadius: 8, marginBottom: 8, display: 'block' }} title={s.title || '分享'} loading="lazy" />
            : <a href={s.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--color-primary)', color: '#fff', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>
                {s.kind === 'music' ? '▶ 播放' : s.kind === 'video' ? '🎬 打开' : s.kind === 'image' ? '🖼️ 查看' : '🔗 打开'}
              </a>}
        </div>
      </div>
    )
  }

  // 复制代码块内容（含降级方案，兼容非 https 部署环境）
  const handleCopy = async () => {
    if (!result) return
    const text = String(result)
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch (_) { /* 忽略降级失败 */ }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ ...paperCard, marginBottom: 6 }} className={`tool-card ${isRunning ? 'status-thinking' : isError ? 'status-err' : 'status-ok'}`}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>
        <ToolTypeIcon name={tool.name} className="tool-icon" style={{ fontSize: 14 }} />
        <span style={{ color: 'var(--color-text-dark)', fontWeight: 600 }}>{tool.name}</span>
        {tool.arguments?.path && <span style={{ color: 'var(--color-text-gray)', fontSize: 11 }}>{tool.arguments.path}</span>}
        <span style={{ marginLeft: 'auto' }}>
          <StatusIcon status={isRunning ? 'running' : isError ? 'err' : 'ok'} style={{ fontSize: 14 }} />
        </span>
      </div>
      {showBody && (
        isCode
          ? (
            <div className="tool-code-wrap">
              {!isRunning && (
                <div className="tool-code-bar">
                  {lang && <span className="tool-code-lang">{lang}</span>}
                  <button
                    type="button"
                    className={`tool-copy-btn${copied ? ' copied' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleCopy() }}
                    title="复制代码"
                  >
                    <Copy style={{ fontSize: 11, marginRight: 3 }} />
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              )}
              <pre className="tool-code">{result || '执行中…'}</pre>
            </div>
          )
          : <div style={{
              padding: '0 12px 8px', maxHeight: 220, overflowY: 'auto', fontSize: 11, lineHeight: 1.7,
              color: isError ? 'var(--color-danger)' : 'var(--color-text-gray)', whiteSpace: 'pre-wrap',
              borderTop: '1px solid var(--color-border-glass)', opacity: isRunning ? 0.7 : 1,
            }}>{result || '执行中…'}</div>
      )}
    </div>
  )
}
