// src/components/LifeBackBtn.jsx — 子页面通用返回按钮
// 从 App.jsx 抽离（行为不变）
export default function LifeBackBtn({ label, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span onClick={onBack} style={{ cursor: 'pointer', fontSize: 18, color: 'var(--color-primary)', padding: 4 }}>←</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-gray)' }}>{label}</span>
    </div>
  )
}
