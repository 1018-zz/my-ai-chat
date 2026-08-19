import { useState } from 'react'
import { getModelLibrary, saveModelLibrary, SCENES, getAllSceneModels, setSceneModel, getDefaultEnabledModelId } from '../utils/models'

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

  // 场景分配：独立 state（不依赖 models 修改触发重渲）
  const [sceneModels, setSceneModels] = useState(() => {
    const saved = getAllSceneModels()
    const out = {}
    for (const s of SCENES) out[s.key] = saved[s.key] || getDefaultEnabledModelId()
    return out
  })
  const [openScene, setOpenScene] = useState(null)
  const pickSceneModel = (sceneKey, modelId) => {
    setSceneModel(sceneKey, modelId)
    setSceneModels(m => ({ ...m, [sceneKey]: modelId }))
  }
  const testSceneModel = async (sceneKey) => {
    const modelId = sceneModels[sceneKey]
    if (!modelId) return
    const btn = document.querySelector(`[data-scene-test="${sceneKey}"]`)
    if (btn) { btn.disabled = true; btn.textContent = '测试中…' }
    try {
      await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/chat/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: '（配置测试：返回一个 ≤10 字的回应确认可用）' }], model: modelId, skipSave: true, conversationId: null }),
      })
      if (btn) btn.textContent = '✅ 可用'
      setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = '测试' } }, 2500)
    } catch (e) {
      if (btn) { btn.textContent = '❌ 失败'; btn.disabled = false }
      setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = '测试' } }, 2500)
    }
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

      {/* 按场景分配模型（功能模型配置：每场景一张卡片，折叠 ▾ 展开挑模型）*/}
      <div style={{ marginTop: 18, fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8 }}>
        <span>🎯 按场景分配模型</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-gray)', margin: '0 0 10px', lineHeight: 1.5 }}>钟泽在不同情境下用不同模型。比如写日记想稳，闲聊想快。每个场景单独配，点 ▾ 展开切模型。</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SCENES.map(sc => {
          const enabledList = models.filter(m => m.enabled)
          const current = sceneModels[sc.key] && enabledList.some(m => m.id === sceneModels[sc.key])
            ? sceneModels[sc.key]
            : enabledList[0]?.id || models[0]?.id || ''
          const curModel = models.find(m => m.id === current)
          const isDefault = !getAllSceneModels()[sc.key]
          const open = openScene === sc.key
          return (
            <div key={sc.key} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,249,239,0.6)', border: '1px solid rgba(201,184,166,0.4)' }}>
              {/* 卡片头：标题 + 描述 */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 14 }}>{sc.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-dark)' }}>{sc.label}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-gray)', marginBottom: 10, lineHeight: 1.5 }}>{sc.desc}</div>
              {/* 灰底子块：当前配置 + 测试按钮 + 折叠 */}
              <div style={{ background: 'rgba(232,228,220,0.45)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-gray)' }}>
                    当前配置：<span style={{ color: 'var(--color-text-dark)', fontWeight: 500 }}>{isDefault ? '默认配置' : '自定义'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 2 }}>
                    模型：<span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{curModel ? `${curModel.id}${curModel.desc ? ` · ${curModel.desc}` : ''}` : '未配置'}</span>
                  </div>
                </div>
                <button
                  className="note-btn"
                  data-scene-test={sc.key}
                  onClick={() => testSceneModel(sc.key)}
                  style={{ fontSize: 11, flexShrink: 0 }}
                >测试</button>
                <button
                  className="note-btn"
                  onClick={() => setOpenScene(open ? null : sc.key)}
                  style={{ fontSize: 14, padding: '4px 8px', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                  aria-label="展开"
                >▾</button>
              </div>
              {/* 折叠区：模型选择列表 */}
              {open && (
                <div style={{ marginTop: 8, padding: '8px 4px', borderTop: '1px dashed rgba(201,184,166,0.5)' }}>
                  {(enabledList.length ? enabledList : models).map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', cursor: 'pointer', borderRadius: 8, background: m.id === current ? 'rgba(192,139,114,0.12)' : 'transparent' }}>
                      <input
                        type="radio"
                        name={`scene-${sc.key}`}
                        checked={m.id === current}
                        onChange={() => pickSceneModel(sc.key, m.id)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--color-text-dark)' }}>{m.label}</div>
                        {m.desc && <div style={{ fontSize: 10.5, color: 'var(--color-text-gray)' }}>{m.desc}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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
