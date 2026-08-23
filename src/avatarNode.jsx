// src/avatarNode.jsx — 头像节点（图片 URL 显示图，否则 emoji/字显示在渐变圆上）
// 从 App.jsx 抽离，供 LairPage / 布置小家共用。纯函数，无 React 生命周期依赖。
// 因含 JSX，单独用 .jsx（仓库约定 .js 不含 JSX）。
export const avatarNode = (val, grad, color, size, extra = {}) => {
  const isImg = typeof val === 'string' && val.startsWith('http')
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, boxShadow: 'var(--shadow-soft)', ...extra }
  if (isImg) return <div style={{ ...base, backgroundImage: `url(${val})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
  return <div style={{ ...base, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.42), color }}>{val}</div>
}
