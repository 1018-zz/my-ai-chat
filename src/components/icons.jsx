// src/components/icons.jsx
// 小家线性图标集（手写 SVG，零依赖）
// 全部 stroke=currentColor，尺寸 1em（跟随父级 font-size），用作工具卡/状态条图标。

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  width: '1em',
  height: '1em',
  display: 'inline-block',
  verticalAlign: 'middle',
  flexShrink: 0,
}

function Svg({ children, ...rest }) {
  return <svg {...base} {...rest}>{children}</svg>
}

// —— 工具类型图标 ——
export const BookOpen = (p) => <Svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></Svg>
export const Pencil = (p) => <Svg {...p}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></Svg>
export const Folder = (p) => <Svg {...p}><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z" /></Svg>
export const Bookmark = (p) => <Svg {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>
export const StickyNote = (p) => <Svg {...p}><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z M15 3v5h5" /></Svg>
export const Gear = (p) => <Svg {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Svg>
// 脑：双半球对称 + 中央分界 + 两侧脑沟
export const Brain = (p) => <Svg {...p}>
  <path d="M12 5.5a2.5 2.5 0 0 0-5 0 2.5 2.5 0 0 0-1 4 2.5 2.5 0 0 0 1 4 2.5 2.5 0 0 0 5 .5" />
  <path d="M12 5.5a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 1 4 2.5 2.5 0 0 1-1 4 2.5 2.5 0 0 1-5 .5" />
  <path d="M12 5.5v13" />
  <path d="M9.5 9.5h-1.6 M9.5 15h-1.6 M14.5 9.5h1.6 M14.5 15h1.6" />
</Svg>
export const WrenchIcon = (p) => <Svg {...p}><path d="M14.7 6.3a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-2.8-2.8z M14.7 6.3 21 13" /></Svg>
export const SproutIcon = (p) => <Svg {...p}><path d="M7 20h10 M12 20v-8 M12 12c0-3 2-5 5-5 0 3-2 5-5 5z M12 12c0-3-2-5-5-5 0 3 2 5 5 5z" /></Svg>
export const LightbulbIcon = (p) => <Svg {...p}><path d="M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5a6 6 0 0 0-4-10z" /></Svg>
export const CheckCircle = (p) => <Svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></Svg>
export const XCircle = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6 M9 9l6 6" /></Svg>
export const Clock = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>

// 工具类型 → 图标映射（read_file/write_file/list_files/read_memories/write_memory/default）
const TOOL_ICONS = {
  read_file: BookOpen,
  write_file: Pencil,
  list_files: Folder,
  read_memories: Brain,
  write_memory: StickyNote,
}
export function ToolTypeIcon({ name, ...rest }) {
  const C = TOOL_ICONS[name] || Gear
  return <C {...rest} />
}

// 状态图标（running/ok/err），颜色随语义
const STATUS_COLOR = { running: '#C08B5E', ok: '#7D9B76', err: '#D97777' }
export function StatusIcon({ status, ...rest }) {
  const color = STATUS_COLOR[status] || 'var(--color-text-gray)'
  if (status === 'running') return <Clock style={{ color, ...(rest.style || {}) }} {...rest} className={`tool-spin ${rest.className || ''}`} />
  if (status === 'err') return <XCircle style={{ color, ...(rest.style || {}) }} {...rest} />
  return <CheckCircle style={{ color, ...(rest.style || {}) }} {...rest} />
}

// 复制（剪贴板）
export const Copy = (p) => <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
