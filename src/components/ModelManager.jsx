import { useState } from 'react'
import { getModelLibrary, saveModelLibrary } from '../utils/models'

// 设置页 · 模型管理（澄 HomeRoom）：维护全局模型库 xiaojia.models
// 只做「启用/停用、添加、删除」；API Key 留到后续阶段（共用 deepseek 端点）。
// 聊天 +号 只从这里挑「启用的」模型，互不混淆。

const PROVIDERS = ['deepseek', 'openai', '通义千问', '其他']

export default function ModelManager() {
  const [models, setModels] = useState(() => getModelLibrary())
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ id: '', label: '', desc: '', provider: 'deepseek' })
  const [err, setErr] = useState('')

  const persist = (next) => {
    setModels(next)
    saveModelLibrary(next)
  }

  const toggleEnabled = (id) => {
    persist(models.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m))
  }

  const removeModel = (id) => {
    if (!window.confirm('从模型库删除这个模型？已选它的聊天会回退到默认模型。')) return
    persist(models.filter(m => m.id !== id))
  }

  const openAdd = () => {
    setForm({ id: '', label: '', desc: '', provider: 'deepseek' })
    setErr('')
    setShowAdd(true)
  }

  const submitAdd = () => {
    const id = form.id.trim()
    const label = form.label.trim()
    if (!id || !label) { setErr('模型标识和显示名都要填'); return }
    if (models.some(m => m.id === id)) { setErr('这个模型标识已存在'); return }
    persist([...models, { id, label, desc: form.desc.trim(), provider: form.provider, enabled: true }])
    setShowAdd(false)
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>✦ 模型管理</span>
        <button className="note-btn" onClick={openAdd} style={{ fontSize: 11 }}>+ 添加模型</button>
      </div>
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,249,239,0.6)', border: '1px solid rgba(201,184,166,0.4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-gray)', margin: '0 0 2px' }}>启用后，才能在聊天的 ✦ 模型 里选到它。聊天里的选择互不干扰。</p>
        {models.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: m.enabled ? 'rgba(192,139,114,0.08)' : 'rgba(120,107,96,0.05)', border: '1px solid rgba(201,184,166,0.35)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-dark)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✦ {m.label}</span>
                {!m.enabled && <span style={{ fontSize: 10, color: '#a89', background: 'rgba(150,140,120,0.18)', padding: '1px 6px', borderRadius: 6 }}>已停用</span>}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--color-text-gray)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.id} · {m.provider}{m.desc ? ' · ' + m.desc : ''}
              </div>
            </div>
            <label style={{ fontSize: 11, color: 'var(--color-text-gray)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!m.enabled} onChange={() => toggleEnabled(m.id)} />
              启用
            </label>
            <button className="note-btn" onClick={() => removeModel(m.id)} style={{ fontSize: 11, color: 'var(--color-danger)' }}>删除</button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,30,24,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onMouseDown={(e) => e.stopPropagation()}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw,360px)', background: '#fffaf3', borderRadius: 14, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-primary)' }}>添加模型</div>
            <label style={{ fontSize: 12, color: 'var(--color-text-gray)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              显示名
              <input className="input" value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} placeholder="如 DeepSeek V4 Pro" style={{ fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--color-text-gray)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              模型标识（直传给接口，需端点真支持）
              <input className="input" value={form.id} onChange={(e) => setForm(f => ({ ...f, id: e.target.value }))} placeholder="如 deepseek-v4-pro" style={{ fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--color-text-gray)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              描述（可选）
              <input className="input" value={form.desc} onChange={(e) => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="如 更强 · 稍慢" style={{ fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--color-text-gray)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              提供方
              <select className="input" value={form.provider} onChange={(e) => setForm(f => ({ ...f, provider: e.target.value }))} style={{ fontSize: 13 }}>
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            {err && <div style={{ fontSize: 11, color: 'var(--color-danger)' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
              <button className="note-btn" onClick={() => setShowAdd(false)} style={{ fontSize: 12 }}>取消</button>
              <button className="note-btn" onClick={submitAdd} style={{ fontSize: 12, background: 'var(--color-primary)', color: '#fff' }}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
