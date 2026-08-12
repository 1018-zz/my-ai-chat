import { useState } from 'react'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

// 压缩工作台（④消息压缩）：日历三级——预览可压周期 → 一键执行 → 批次历史可溯源
const LEVELS = [
  { key: 'daily', title: '每日', desc: '压前一天（等 7 天闭合）' },
  { key: 'weekly', title: '每周', desc: '压 7 天（父级等子级）' },
  { key: 'monthly', title: '每月', desc: '压 30 天（父级等子级）' },
]

export default function CompressionRoom({ onBack }) {
  const [level, setLevel] = useState('daily')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [batches, setBatches] = useState([])

  const doPreview = async (lv) => {
    setLevel(lv); setLoading(true); setResult(null)
    try {
      const r = await fetch(`${API_BASE}/api/compression?preview=1&level=${lv}`)
      setPreview(await r.json())
    } catch (_) { setPreview({ error: '预览失败' }) }
    setLoading(false)
  }

  const doRun = async () => {
    if (!window.confirm(`执行「${level}」压缩？输入消息会归档为冷档（不删，可溯源），重要的会自动进记忆库。`)) return
    setRunning(true); setResult(null)
    try {
      const r = await fetch(`${API_BASE}/api/compression`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level }) })
      setResult(await r.json())
      refreshBatches()
    } catch (_) { setResult({ error: '执行失败' }) }
    setRunning(false)
  }

  const refreshBatches = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/compression?batches=1`)
      const d = await r.json()
      setBatches(d.batches || [])
    } catch (_) {}
  }

  const backBtn = (
    <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--color-text-gray)', fontSize: 13, cursor: 'pointer', padding: '4px 0', marginBottom: 8 }}>← 返回</button>
  )

  return (
    <div className="life-room">
      {backBtn}
      <h3 style={{ color: 'var(--color-primary)' }}>🗜️ 压缩工作台</h3>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 12, marginTop: 4 }}>
        日历三级压缩：对话压成每日/每周/每月记忆。压缩有损——但重要的会自动进记忆库，原文归档可溯源。
      </p>

      {/* 层级选择 */}
      <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
        {LEVELS.map(l => (
          <button
            key={l.key}
            onClick={() => doPreview(l.key)}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', flex: 1,
              border: level === l.key ? '1px solid var(--color-primary)' : '1px solid var(--color-border-glass)',
              background: level === l.key ? 'rgba(124,108,178,0.12)' : 'rgba(255,255,255,0.5)',
              color: level === l.key ? 'var(--color-primary)' : 'var(--color-text-gray)',
              fontWeight: level === l.key ? 600 : 400,
            }}
          >
            {l.title}
            <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{l.desc}</div>
          </button>
        ))}
      </div>

      {/* 预览结果 */}
      {loading && <div style={{ fontSize: 12, color: 'var(--color-text-gray)', padding: 12 }}>计算中…</div>}
      {preview && !loading && !preview.error && (
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.6)', border: '1px solid var(--color-border-glass)', fontSize: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{preview.title} · 可压 {preview.periodCount} 个周期 · {preview.itemCount} 条输入 · 预计 {preview.estimatedCalls} 次调用</div>
          {preview.blockedCount > 0 && <div style={{ color: 'var(--color-text-gray)', marginBottom: 6 }}>⏳ {preview.blockedCount} 个周期被父级阻塞（子级还没压完）</div>}
          {preview.periods.length === 0 && <div style={{ color: 'var(--color-text-gray)' }}>没有到期可压的周期（daily 要等 7 天闭合）</div>}
          {preview.periods.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {preview.periods.map(p => (
                <span key={p.label} style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(124,108,178,0.08)', color: 'var(--color-text-gray)' }}>
                  {p.label} · {p.itemCount}
                </span>
              ))}
            </div>
          )}
          {preview.canRun && (
            <button className="note-btn" style={{ marginTop: 10 }} onClick={doRun} disabled={running}>
              {running ? '压缩中…' : `执行 ${preview.title} 压缩`}
            </button>
          )}
        </div>
      )}
      {preview?.error && <div style={{ fontSize: 12, color: 'var(--color-danger, #D97777)', padding: 8 }}>⚠️ {preview.error}</div>}

      {/* 执行结果 */}
      {result && (
        <div style={{ padding: 10, borderRadius: 12, background: 'rgba(157,187,140,0.12)', border: '1px solid rgba(157,187,140,0.35)', fontSize: 12, marginBottom: 10 }}>
          {result.error ? `⚠️ ${result.error}` : `✅ 压完 ${result.level}：${result.inputCount} 条输入 → ${result.outputCount} 条摘要（重要的已进记忆库，原文归档可溯源）`}
        </div>
      )}

      {/* 批次历史 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', margin: '14px 0 8px' }}>📜 压缩批次</div>
      <button className="note-btn" onClick={refreshBatches}>刷新</button>
      {batches.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 8 }}>还没有压缩批次</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {batches.map(b => (
          <div key={b.id} style={{ padding: 8, borderRadius: 10, background: 'rgba(255,255,255,0.5)', border: '1px solid var(--color-border-glass)', fontSize: 11, color: 'var(--color-text-gray)' }}>
            {b.level} · {b.input_count}→{b.output_count} 条 · {b.status}
            {b.completed_at ? ` · ${new Date(b.completed_at).toLocaleString('zh-CN', { hour12: false })}` : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
