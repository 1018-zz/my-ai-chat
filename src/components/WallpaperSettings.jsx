import { useState, useEffect } from 'react'

// 布置小家 · 壁纸（澄 HomeRoom v2）：上传壁纸 + 透明度/暗化滑块 → localStorage
// 环境层三件套：wallpaper-layer（壁纸）+ warm-light（暖光）+ room-vignette（暗角）
// 以后头像/房间物件走同一条"小家图库"管道（升级 Supabase Storage）

const DEFAULT_WALLPAPER = 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1800&q=85'

function applyWallpaperVars(wp, op, dk) {
  const root = document.documentElement
  root.style.setProperty('--wallpaper', wp ? `url("${wp}")` : 'none')
  root.style.setProperty('--wallpaper-opacity', op)
  root.style.setProperty('--wallpaper-darken', dk)
}

export default function WallpaperSettings() {
  const [wallpaper, setWallpaper] = useState(() => {
    try { return localStorage.getItem('home-wallpaper') || '' } catch { return '' }
  })
  const [opacity, setOpacity] = useState(() => {
    try { return Number(localStorage.getItem('wallpaper-opacity') || 0.34) } catch { return 0.34 }
  })
  const [darken, setDarken] = useState(() => {
    try { return Number(localStorage.getItem('wallpaper-darken') || 0.12) } catch { return 0.12 }
  })

  useEffect(() => {
    applyWallpaperVars(wallpaper, opacity, darken)
    try {
      localStorage.setItem('home-wallpaper', wallpaper)
      localStorage.setItem('wallpaper-opacity', String(opacity))
      localStorage.setItem('wallpaper-darken', String(darken))
    } catch (_) {}
  }, [wallpaper, opacity, darken])

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return }
    const reader = new FileReader()
    reader.onload = () => setWallpaper(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const useDefault = () => setWallpaper(DEFAULT_WALLPAPER)
  const clearWallpaper = () => setWallpaper('')

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8 }}>🖼 布置小家 · 壁纸</div>
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,249,239,0.6)', border: '1px solid rgba(201,184,166,0.4)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 壁纸预览 */}
        <div style={{ height: 80, borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg,#f5eee4,#eee4d5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#796b60' }}>
          {wallpaper
            ? <img src={wallpaper} alt="壁纸预览" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : '还没有壁纸——让小家有一面墙'}
        </div>
        {/* 上传 */}
        <label style={{ fontSize: 12, color: 'var(--color-text-gray)', cursor: 'pointer' }}>
          上传壁纸（图片会存在你的手机上）
          <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
        </label>
        {/* 透明度 */}
        <label style={{ fontSize: 12, color: 'var(--color-text-gray)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          壁纸在墙上的深浅（{opacity.toFixed(2)}）
          <input type="range" min="0.1" max="0.65" step="0.01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: '100%' }} />
        </label>
        {/* 暗化 */}
        <label style={{ fontSize: 12, color: 'var(--color-text-gray)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          房间的黄昏感（{darken.toFixed(2)}）
          <input type="range" min="0" max="0.4" step="0.01" value={darken} onChange={(e) => setDarken(Number(e.target.value))} style={{ width: '100%' }} />
        </label>
        {/* 快捷操作 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="note-btn" onClick={useDefault} style={{ fontSize: 11 }}>试试默认壁纸</button>
          {wallpaper && <button className="note-btn" onClick={clearWallpaper} style={{ fontSize: 11 }}>撤掉壁纸</button>}
        </div>
      </div>
    </div>
  )
}
