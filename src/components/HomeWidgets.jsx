// 小家首页模块系统 v0.3 —— 不规则小桌面
import './HomeWidgets.css'

export const widgets = [
  {
    id: 'music',
    icon: '🎵',
    title: '一起听歌',
    desc: '还没有播放歌曲',
    tint: '--accent-peach',
    paper: 'note',
    size: 'large',
    rotate: -2.4,
    x: 0,
    y: 4,
    enabled: true,
  },
  {
    id: 'diary',
    icon: '📖',
    title: '今日小记',
    desc: '今天还没写',
    tint: '--accent-mint',
    paper: 'journal',
    size: 'medium',
    rotate: -1.2,
    x: 0,
    y: 0,
    enabled: true,
  },
]

const AppIcon = ({
  icon,
  title,
  desc,
  tint,
  paper = 'journal',
  size = 'medium',
  rotate = 0,
  x = 0,
  y = 0,
  onClick,
}) => {
  const style = {
    '--widget-rotate': `${rotate}deg`,
    '--widget-x': `${x}px`,
    '--widget-y': `${y}px`,
    '--tape': tint ? `var(${tint})` : undefined,
  }

  return (
    <button
      type="button"
      className={`app-icon app-icon--${size}`}
      style={style}
      onClick={onClick}
      aria-label={title}
    >
      <span className={`app-icon-tile paper-surface paper-surface--${paper}`}>
        <span className="paper-tape" />

        <span className="app-icon-glyph" aria-hidden="true">
          {icon}
        </span>

        <span className="app-icon-copy">
          <span className="app-icon-label">{title}</span>
          {desc && (
            <span className="app-icon-desc">{desc}</span>
          )}
        </span>

        <span className="paper-fold" aria-hidden="true" />
      </span>
    </button>
  )
}

export default function HomeWidgets({ items = widgets, onOpen }) {
  const handleOpen = (item) => {
    console.log(`open ${item.id}`)
    onOpen?.(item)
  }

  const visible = items.filter(w => w.enabled !== false)

  if (visible.length === 0) return null

  return (
    <section className="app-desk" aria-label="我的空间">
      <div className="app-desk-surface">
        {visible.map((item, index) => (
          <AppIcon
            key={item.id || index}
            {...item}
            onClick={() => handleOpen(item)}
          />
        ))}
      </div>
    </section>
  )
}
