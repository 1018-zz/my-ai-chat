import { fetchConversations, createConversation, deleteConversation, softDeleteConversation, restoreConversation, fetchTrashConversations, fetchMessages, searchMemories } from './utils/api'
import { normalizeMessage } from './utils/normalize'
import { fmtMsgTime } from './utils/time'
import { applyTwemoji } from './utils/emoji'
import RunCard from './components/RunCard'
import ChatInputBar from './components/ChatInputBar'
import { getChatModel, setChatModel } from './utils/models'
import StatisticsPage from './components/StatisticsPage'
import { stats, estimateTokens } from './utils/stats'
import HomeWidgets, { widgets } from './components/HomeWidgets'
import NoteCard from './components/NoteCard'
import NotePanel from './components/NotePanel'
import JournalBook from './components/JournalBook'
import CompressionRoom from './components/CompressionRoom'
import WallpaperSettings from './components/WallpaperSettings'
import ModelManager from './components/ModelManager'
import { buildSystemPrompt } from './project/instructions'
import { MCP_TOOLS, TOOL_GROUPS, MODE_LABEL, loadMcpAuth, saveMcpAuth, setMcpToolMode, MCP_AUTH_EVENT } from './utils/mcpAuth'
import { getProjectMemories, addProjectMemory, deleteProjectMemory, injectMemoriesToPrompt } from './project/memories'
import Markdown from './components/Markdown'
import './dreamCard.css'
import { pushSupported, registerServiceWorker, subscribePush, unsubscribePush, sendTestPush } from './utils/push'
import SplashScreen from './components/SplashScreen'
import { playNotifySound } from './utils/notify'
import { useState, useEffect, useRef, useCallback } from 'react'
import './styles/theme.css'
import './styles/chat-tweaks.css'
import './styles/journal-tweaks.css'
import './styles/life-tweaks.css'
import './styles/memory-tweaks.css'
import './styles/global-tweaks.css'
import './styles/lair-tweaks.css'
import './styles/motion-tweaks.css'

// ===== 消息操作图标（内联线性 SVG，替代 emoji，随文字颜色着色，更精致）=====
const ActionIcons = {
  recall: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M3.6 13a9 9 0 1 0 2.5-6.4L3 7" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2v2H5v4h4z" />
      <path d="M19 17h-4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2v2h-4v4h4z" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
}

// 去掉 markdown 语法，转成纯文本（用于复制对话）
function stripMarkdown(src) {
  return String(src || '')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')            // 行内/块代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')              // 图片
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')           // 链接 → 文字
    .replace(/^#{1,6}\s+/gm, '')                       // 标题 #
    .replace(/^>\s?/gm, '')                            // 引用 >
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')   // 粗体/斜体/删除线
    .replace(/^\s*[-*+]\s+/gm, '• ')                   // 列表 → 圆点
    .replace(/\n{3,}/g, '\n\n')                        // 多余空行
    .trim()
}
// 复制文本（含降级方案，兼容非 https 部署环境）
async function copyText(text) {
  const t = String(text || '')
  try {
    await navigator.clipboard.writeText(t)
  } catch (e) {
    const ta = document.createElement('textarea')
    ta.value = t
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (_) { /* 忽略降级失败 */ }
    document.body.removeChild(ta)
  }
}
// 复制成功轻提示（动态插入，不依赖组件 state）
function showCopyHint(text = '已复制到剪贴板') {
  const el = document.createElement('div')
  el.className = 'copy-hint'
  el.textContent = text
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => el.remove(), 250)
  }, 1200)
}

// 用户消息行：预留头像位 + 气泡列（长文本可折叠，仿 ChatGPT）+ 时间戳置于气泡下方
function UserMsgRow({ msg, avatar, onAvatarClick }) {
  const [expanded, setExpanded] = useState(false)
  const bodyRef = useRef(null)
  const [overflow, setOverflow] = useState((msg.text || '').length > 240)
  useEffect(() => {
    const el = bodyRef.current
    if (el) setOverflow(el.scrollHeight - el.clientHeight > 4)
  }, [msg.text])
  const showToggle = overflow || expanded
  return (
    <div className="msg-row msg-row-self">
      <div className="msg-col">
        {msg.deleted ? (
          <div className="msg-recalled">已撤回</div>
        ) : (
          <>
            {msg.quote && (
              <div className="msg-quote">
                <span className="msg-quote__who">{msg.quote.isSelf ? '泠泠' : '钟泽'}</span>
                <span className="msg-quote__text">{msg.quote.text}</span>
              </div>
            )}
            <div className={`msg-bubble ${!expanded && overflow ? 'msg-folded' : ''}`} ref={bodyRef}>
              <Markdown>{msg.text}</Markdown>
            </div>
            {(() => { const imgs = msg.images || (msg.image ? [msg.image] : []); return imgs.length ? <div className="msg-images">{imgs.map((src, i) => <img key={i} className="msg-image" src={src} alt="" />)}</div> : null })()}
            {showToggle && (
              <button className="msg-fold-toggle" onClick={() => setExpanded(v => !v)}>
                {expanded ? '收起 ▲' : '展开全文 ▼'}
              </button>
            )}
            {msg.ts && <div className="msg-meta">{fmtMsgTime(msg.ts)}</div>}
          </>
        )}
      </div>
      <div
        className="msg-avatar msg-avatar-self"
        style={avatar?.startsWith('http') ? { backgroundImage: `url(${avatar})`, backgroundSize: 'cover', color: 'transparent' } : {}}
        onClick={onAvatarClick}
        title="点击换头像"
      >{avatar?.startsWith('http') ? '' : (avatar || '我')}</div>
    </div>
  )
}

const API_BASE = import.meta.env.VITE_API_BASE || ''
const MCP_URL = `${API_BASE}/api/mcp-proxy`
const systemPrompt = buildSystemPrompt()
const MAX_TOOL_ROUNDS = 16
const TOOL_OUTPUT_LIMIT = 6000

// 卡片统一玻璃样式（饱和毛玻璃：模糊 + 饱和度增强，通透浓郁）
const glassCard = {
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  border: '1px solid var(--color-border-glass)',
  background: 'var(--color-card-glass)',
  backdropFilter: 'blur(20px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
  boxShadow: 'var(--shadow-soft)',
  maxWidth: '75%',
}

const tabList = [
  { key: 'lair', label: 'LAIR', icon: '🏠' },
  { key: 'chat', label: 'CHAT', icon: '💬' },
  { key: 'life', label: 'LIFE', icon: '📋' },
]

const TabNav = ({ activeTab, onChangeTab }) => (
  <div className="tab-nav">
    {tabList.map(item => (
      <div key={item.key} className={`tab-item ${activeTab === item.key ? 'active' : ''}`} onClick={() => onChangeTab(item.key)}>
        <span className="tab-icon">{item.icon}</span><span className="tab-text">{item.label}</span>
      </div>
    ))}
  </div>
)

// LAIR：在一起天数（从 2026-03-13 动态计算）
// 天气 → 状态牌「此刻的家」：真实天气+时段驱动的呼吸话（不瞎编情绪，无独立数据源时回退写死文案）
const WEATHER_STATE = {
  雨: '在窗边听雨', 雪: '在窗边看雪', 雷: '在窗边看雨', 雾: '在雾里发呆',
  晴: '在晒太阳', 多云: '窝在沙发上', 阴: '窝在沙发上',
}
// 天气 → 房间微调 tint：极淡，叠在奶白基底之上（像"窗外有点雨"，不是"房间变蓝"）。
// 只做轻微偏移——雨天偏冷一点点、雪天偏亮一点点——守住"天气是窗外，不是装修"。
const WEATHER_TINT = {
  雨: 'rgba(104,120,146,0.09)', 雪: 'rgba(206,220,238,0.07)', 雾: 'rgba(200,202,206,0.08)',
  雷: 'rgba(86,86,110,0.10)', 晴: 'rgba(255,226,160,0.06)', 多云: 'rgba(190,192,198,0.05)', 阴: 'rgba(124,130,142,0.08)',
}
// 窗外感知短语：把"天气字段"弱化为"窗外状态"，不露出 Season·Sky 这类机器标签
const WINDOW_PHRASE = {
  雨: '🌧 窗外有点雨',
  雪: '❄ 窗外落雪',
  雾: '🌫 外面起了雾',
  雷: '⚡ 外头在打雷',
  晴: '☀ 窗外有光',
  多云: '⛅ 云有点多',
  阴: '☁ 天有点阴',
}
// 天气 → 小家环境：把"信息"升为"环境变量"（视觉仅轻微微调，不替换家本体）。
// 优先读结构化字段（environment / homeAtmosphere / feeling），旧字段作兜底。
function weatherToLair(w) {
  if (!w) return null
  const env = w.environment || {}
  const ha = w.homeAtmosphere || {}
  const feeling = w.feeling || {}
  const sky = env.sky || w.sky
  const period = env.period || w.period
  // 房间微调 tint（极淡，叠在奶白基底之上）
  const tint = WEATHER_TINT[sky] || 'transparent'
  // 状态牌：窗外感知（弱化天气参数）+ 家居氛围正文（钟泽/泠泠语气，不是天气摘要）
  const moodTag = WINDOW_PHRASE[sky] || '🪟 窗外'
  const moodText = ha.message || feeling.text || '今天家里刚刚好'
  // 钟泽此刻在做什么：以【时段】为主、【天气】为辅，绝不露机器标签。
  // 关键：夜里亮晴不能显示「在晒太阳」，深夜统一在灯下，晴天才分早晚场景。
  let stateText
  if (period === '深夜') stateText = '还没睡，在灯下坐着'
  else if (period === '夜晚' && sky !== '晴') stateText = '在灯下发呆'
  else if (period === '夜晚' && sky === '晴') stateText = '在窗边看星星'
  else if (period === '傍晚' && sky === '晴') stateText = '在窗边看夕阳'
  else if (period === '早晨' && sky === '晴') stateText = '在窗边接晨光'
  else if ((period === '上午' || period === '中午' || period === '下午') && sky === '晴') stateText = '在晒太阳'
  else stateText = WEATHER_STATE[sky] || '在窗边发呆'
  return { tint, moodTag, moodText, stateText }
}
// 收起来的明信片：钟泽出门（乌有乡）寄回的明信片墙。直接读 VPS 上 nowhere 服务的 /postcards，
// 复用乌有乡自己的明信片存储，不另搞 Supabase 中转（符合乌有乡设计，单数据源、最稳）。
// NOWHERE_BASE 走同源代理：域名/3000 下用 /nowhere（nginx 反代到 127.0.0.1:8080，规避 CORS+混跑）；
// 仅老的 8081 静态壳子仍直连 :8080（过渡期兼容，端口收掉后此分支即失效）。
const NOWHERE_BASE = window.location.port === '8081'
  ? `http://${window.location.hostname}:8080`
  : '/nowhere'
const TravelAlbum = () => {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [openItem, setOpenItem] = useState(null)

  // 打开相册时再拉数据（懒加载），避免 LAIR 一进来就打 Supabase
  const openAlbum = () => {
    setOpen(true)
    if (items.length > 0 || loading) return
    setLoading(true)
    fetch(`${NOWHERE_BASE}/postcards`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setItems(d); setLoading(false) })
      .catch(() => { setLoading(false) })
  }

  // 浮层打开时锁底层滚动（同 NoteCard）
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <>
      {/* 入口卡片：和「我的空间」那三张纸卡同款（复用 app-icon/paper-surface/paper-tape/paper-fold），点击展开相册 */}
      <button
        type="button"
        className="app-icon app-icon--medium album-entry"
        style={{ '--widget-rotate': '-1.6deg' }}
        onClick={openAlbum}
        aria-label="收起来的明信片"
      >
        <span className="app-icon-tile paper-surface paper-surface--memory">
          <span className="paper-tape" />
          <span className="app-icon-glyph" aria-hidden="true">🖼️</span>
          <span className="app-icon-copy">
            <span className="app-icon-label">收起来的明信片</span>
            <span className="app-icon-desc">{items.length ? `${items.length} 张明信片` : '点开看看'}</span>
          </span>
          <span className="paper-fold" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="travel-mask" onClick={() => { setOpen(false); setOpenItem(null); }}>
          <div className="travel-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="travel-sheet__head">
              <div>
                <div className="travel-sheet__title">收起来的明信片</div>
                <div className="travel-sheet__hint">钟泽寄回的明信片</div>
              </div>
              <button className="travel-sheet__close" onClick={() => { setOpen(false); setOpenItem(null); }} aria-label="关闭">✕</button>
            </div>
            {items.length === 0 ? (
              <div className="travel-album__empty">{loading ? '正在翻看他的行囊…' : '钟泽还没寄回明信片，等他出门走走 🌿'}</div>
            ) : (
              <div className="travel-album__grid">
                {items.map((it) => (
                  <button key={it.id} className="travel-album__cell" onClick={() => { setOpen(false); setOpenItem(it); }}>
                    {it.front_img
                      ? <img className="travel-album__img" src={NOWHERE_BASE + it.front_img} alt={(it.stamp && it.stamp.place) || '明信片'} loading="lazy" />
                      : <div className="travel-album__ph">✉️</div>}
                    <div className="travel-album__cap">{(it.stamp && it.stamp.place) || 'somewhere'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {openItem && (
        <div className="travel-lightbox" onClick={() => setOpenItem(null)}>
          <div className="travel-lightbox__card" onClick={(e) => e.stopPropagation()}>
            {openItem.front_img && <img className="travel-lightbox__img" src={NOWHERE_BASE + openItem.front_img} alt={(openItem.stamp && openItem.stamp.place) || '明信片'} />}
            <div className="travel-lightbox__meta">
              <div className="travel-lightbox__place">{(openItem.stamp && openItem.stamp.place) || 'somewhere'}</div>
              <div className="travel-lightbox__text">{openItem.text}</div>
              {openItem.stamp && (
                <div className="travel-lightbox__stamp">
                  {[openItem.stamp.weather, openItem.stamp.surface, openItem.stamp.local_time].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <button className="travel-lightbox__close" onClick={() => setOpenItem(null)}>✕</button>
          </div>
        </div>
      )}
    </>
  )
}

// 桌上明信片：钟泽出门（乌有乡）寄回的最新一张，像他顺手放在桌上。只展示、不点击。
// 规则：取最新一张（新卡自然覆盖旧卡）；0–3天正常展示；3–7天逐渐淡出（透明度降 + 往桌角偏移）；超过7天隐藏。
// 桌上明信片：钟泽出门（乌有乡）寄回的最新一张，像他顺手放在桌上。
// 旅行状态的主角：只展示图片（去掉他说的文字）；若他同时做了梦，角上标🌙，点开看梦余韵。
// 规则：取最新一张（新卡自然覆盖旧卡）；0–3天正常展示；3–7天逐渐淡出；超过7天隐藏（桌面交还梦卡）。
const PostcardShelf = () => {
  const [card, setCard] = useState(null)
  const [age, setAge] = useState(0)
  const [dream, setDream] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    const postcardP = fetch(`${NOWHERE_BASE}/postcards`).then(r => r.json()).catch(() => null)
    const awareP = fetch(`${API_BASE}/api/home/awareness`).then(r => r.json()).catch(() => null)
    Promise.all([postcardP, awareP]).then(([pd, ad]) => {
      if (!alive || !Array.isArray(pd) || pd.length === 0) return
      const sorted = [...pd].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      const latest = sorted[0]
      const ts = latest.created_at ? new Date(latest.created_at).getTime() : 0
      const a = ts ? Math.floor((Date.now() - ts) / 86400000) : 0
      if (a > 7) return
      setAge(a)
      setCard(latest)
      const moments = (ad && ad.homeMoments) || []
      setDream(moments.find(m => m.type === 'dream') || null)
    })
    return () => { alive = false }
  }, [])
  if (!card) return null
  const fade = age <= 3 ? 1 : Math.max(0.18, 0.6 - (age - 3) * 0.11)
  const drift = age <= 3 ? 0 : Math.min(20, (age - 3) * 4.5)
  const place = (card.stamp && card.stamp.place) || 'somewhere'
  const photo = card.front_img
    ? <img src={NOWHERE_BASE + card.front_img} alt={place} loading="lazy" />
    : <div className="postcard-shelf__ph">✉️</div>
  return (
    <>
      <div
        className="postcard-shelf"
        style={{ opacity: fade, transform: `translateX(${drift}px) rotate(${drift ? 2.2 : -1.4}deg)`, cursor: dream ? 'pointer' : 'default' }}
        onClick={dream ? () => setOpen(true) : undefined}
      >
        <div className="postcard-shelf__tape" />
        {dream && <div className="postcard-shelf__moon">🌙</div>}
        <div className="postcard-shelf__photo">{photo}</div>
        <div className="postcard-shelf__place">{place}</div>
        {/* 旅行时只留图片：去掉他说的文字(text)与“钟泽从外面寄回的”(from) */}
      </div>
      {open && dream && (
        <div className="dream-sheet-mask" onClick={() => setOpen(false)}>
          <div className="dream-sheet" onClick={(e) => e.stopPropagation()}>
            {card.front_img && <img className="postcard-sheet__img" src={NOWHERE_BASE + card.front_img} alt={place} />}
            <div className="postcard-sheet__place">{place}</div>
            <div className="dream-sheet__title">昨夜的余韵</div>
            <div className="dream-sheet__content">{dream.content}</div>
            <div className="dream-sheet__note">这不是记忆，只是醒来时留下的一点想象。</div>
          </div>
        </div>
      )}
    </>
  )
}

// 昨夜留下：钟泽做梦后留在小家的余韵。放在 LAIR 状态区（不是 LIFE 工具），
// 像桌上多了一张纸——他也有自己的夜晚。数据复用 /api/home/awareness 的 homeMoments
// （后端已归一化，前端只认 type:'dream'，不写死 wake_dream）。
const DreamCard = () => {
  const [dream, setDream] = useState(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let alive = true
    const postcardP = fetch(`${NOWHERE_BASE}/postcards`).then(r => r.json()).catch(() => null)
    const awareP = fetch(`${API_BASE}/api/home/awareness`).then(r => r.json()).catch(() => null)
    Promise.all([postcardP, awareP]).then(([pd, ad]) => {
      if (!alive) return
      // 他出门寄回明信片（≤7天）时，梦卡彻底隐退——桌面交给明信片（它会在角上标🌙、点开附梦余韵）
      if (Array.isArray(pd) && pd.length) {
        const sorted = [...pd].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        const latest = sorted[0]
        if (latest && latest.created_at) {
          const age = Math.floor((Date.now() - new Date(latest.created_at).getTime()) / 86400000)
          if (age <= 7) { setHidden(true); setLoading(false); return }
        }
      }
      const moments = (ad && ad.homeMoments) || []
      setDream(moments.find(m => m.type === 'dream') || null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])
  if (loading || hidden) return null
  if (!dream) {
    return (
      <div className="dream-card dream-card--empty">
        昨夜没有留下梦。<br />小家安安静静地睡了一晚。
      </div>
    )
  }
  return (
    <>
      <div className="dream-card" onClick={() => setOpen(true)}>
        <div className="dream-card__tape" />
        <div className="dream-card__moon">🌙</div>
        <div className="dream-card__label">昨夜留下</div>
        <div className="dream-card__line">钟泽做了一个梦</div>
        <div className="dream-card__quote">{dream.summary}……</div>
        <div className="dream-card__time">{dreamTimeLabel(dream.createdAt)}</div>
      </div>
      {open && (
        <div className="dream-sheet-mask" onClick={() => setOpen(false)}>
          <div className="dream-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dream-sheet__title">昨夜的余韵</div>
            <div className="dream-sheet__content">{dream.content}</div>
            <div className="dream-sheet__note">这不是记忆，只是醒来时留下的一点想象。</div>
          </div>
        </div>
      )}
    </>
  )
}

// 梦的时间标签（北京时间）：凌晨 3:12 / 晚上 9:30
function dreamTimeLabel(iso) {
  if (!iso) return ''
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000)
  const h = t.getUTCHours()
  const m = t.getUTCMinutes()
  const hh = `${h}:${String(m).padStart(2, '0')}`
  let period = '凌晨'
  if (h >= 6 && h < 9) period = '早上'
  else if (h >= 9 && h < 12) period = '上午'
  else if (h >= 12 && h < 14) period = '中午'
  else if (h >= 14 && h < 17) period = '下午'
  else if (h >= 17 && h < 19) period = '傍晚'
  else if (h >= 19 && h < 22) period = '晚上'
  else if (h >= 22) period = '夜里'
  if (period === '凌晨') return `凌晨 ${hh}`
  return `${period} ${hh}`
}

// 头像节点：图片 URL 显示图，否则 emoji/字显示在渐变圆上（LAIR / 布置小家共用，跟随全局头像）
const avatarNode = (val, grad, color, size, extra = {}) => {
  const isImg = typeof val === 'string' && val.startsWith('http')
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, boxShadow: 'var(--shadow-soft)', ...extra }
  if (isImg) return <div style={{ ...base, backgroundImage: `url(${val})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
  return <div style={{ ...base, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.42), color }}>{val}</div>
}

const LairPage = ({ avatarSelf, avatarAi }) => {
  const [days, setDays] = useState(0)
  const [notePanel, setNotePanel] = useState(false)
  const [journalBook, setJournalBook] = useState(false)
  const [weather, setWeather] = useState(null)
  useEffect(() => {
    const start = new Date('2026-03-13T00:00:00+08:00')
    const diff = Math.floor((Date.now() - start.getTime()) / 86400000)
    setDays(Math.max(diff, 0))
  }, [])
  // 钟泽此刻的状态牌：真实天气 + 时段驱动（呈现层，失败回退写死文案）
  // 不传 city → 跟随泠泠当前所在（user_location），旅行/搬家后状态牌自动跟着变
  useEffect(() => {
    fetch(`${API_BASE}/api/home/weather`).then(r => r.json()).then(d => {
      if (d && d.ok && d.weather) setWeather(d.weather)
    }).catch(() => {})
  }, [])
  const lair = weatherToLair(weather)
  return (
    <div className="lair-room" style={{ '--weather-tint': lair?.tint || 'transparent' }}>
      <h3 style={{ color: 'var(--color-primary)' }}>🏠 LAIR</h3>
      {/* —— 顶部：左「屋里的灯」状态牌 + 右缩小版「在一起」天数卡 —— */}
      <div className="lair-top">
        <div className="lair-status" style={{ ...glassCard, flex: 1, minWidth: 0, padding: 'var(--lair-status-pad, 14px)', display: 'flex', alignItems: 'center', gap: 'var(--lair-status-gap, 12px)' }}>
          {/* 我和他头像轻微交叠（动态跟随全局头像；LAIR 内不点击换，保持沉浸） */}
          <div style={{ position: 'relative', width: 62, height: 38, flexShrink: 0 }}>
            {avatarNode(avatarSelf, 'linear-gradient(135deg,#E7D7C5,#C4A88F)', '#5A4636', 38, { position: 'absolute', left: 0, top: 0 })}
            {avatarNode(avatarAi, 'linear-gradient(135deg,var(--color-primary-light),var(--color-primary))', '#fff', 38, { position: 'absolute', left: 24, top: 0, border: '2px solid var(--color-paper)' })}
          </div>
          <div className="lair-status__body">
            <div className="lair-status__kicker">屋里的灯</div>
            <div className="lair-status__name">钟泽</div>
            <div className="lair-status__mood">
              <span className="lair-status__mood-tag">{lair ? lair.moodTag : '🪟 窗外'}</span>
              <span className="lair-status__mood-text">{lair ? lair.moodText : '今天家里刚刚好'}</span>
            </div>
            <div className="lair-status__state">
              <span className="lair-status__state-label">正在</span>
              <span className="lair-status__state-text">{lair ? lair.stateText : '窗边等你'}</span>
            </div>
          </div>
        </div>
        {/* 右：缩小版「在一起」天数卡 */}
        <div className="lair-days" style={{ ...glassCard, flexShrink: 0, width: 92, padding: '12px 8px', textAlign: 'center' }}>
          <div className="lair-days__num">{days}</div>
          <div className="lair-days__unit">天</div>
          <div className="lair-days__sub">在一起</div>
        </div>
      </div>
      {/* —— 桌上明信片：钟泽寄回的最新一张（只展示不点击） —— */}
      <PostcardShelf />
      {/* —— 昨夜留下：钟泽做梦后留在小家的余韵（像桌上多了一张纸） —— */}
      <DreamCard />
      {/* —— 我的空间 · Widget 模块区（配置驱动，未来可扩展开关/排序/自定义） —— */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 10 }}>我的空间</div>
        <HomeWidgets items={widgets} onOpen={(w) => { if (w.id === 'diary') setJournalBook('today') }} />
      </div>
      {/* —— 收起来的明信片 · 钟泽出门寄回的明信片（复用乌有乡，落库 travel 表）—— */}
      <TravelAlbum />
      {/* —— 小纸条 · 双人留言板（便利贴 v0.4，已接真数据） —— */}
      <NoteCard onOpenPanel={() => setJournalBook(true)} />
      {journalBook && <JournalBook onClose={() => setJournalBook(false)} />}
      {notePanel && <NotePanel onClose={() => setNotePanel(false)} />}
    </div>
  )
}

const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// 小家日界线：凌晨5点前算前一天（与 mcp.js write_diary / dayRange 一致）
const bjDayStr = (d = new Date()) => {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000)
  let s = bj.toISOString().slice(0, 10)
  if (bj.getUTCHours() < 5) s = new Date(bj.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  return s
}
// 日记页用：把 YYYY-MM-DD 拆成「MM.DD + 星期」，做成手帐日期页签
const diaryDateParts = (s) => {
  const [y, m, d] = String(s).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    mmdd: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    week: dt.toLocaleDateString('zh-CN', { weekday: 'long' }),
  }
}

const MEM_TYPE = {
  moment: { label: '不能丢的时刻', badge: '时刻', cls: 'mem-type-moment' },
  note: { label: 'AI 记下的', badge: 'AI', cls: 'mem-type-note' },
  compressed: { label: '压缩沉淀', badge: '沉淀', cls: 'mem-type-compressed' },
}
const MEM_ORDER = ['moment', 'note', 'compressed']

const MemPanel = () => {
  const [mems, setMems] = useState([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { getProjectMemories().then(setMems).catch(() => {}) }, [])
  const handleAdd = async () => {
    if (!content.trim() || loading) return
    setLoading(true)
    try {
      await addProjectMemory(title.trim() || '未命名', content.trim())
      setTitle(''); setContent('')
      setMems(await getProjectMemories())
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  const handleDelete = async (id) => {
    await deleteProjectMemory(id)
    setMems(mems.filter(m => m.id !== id))
  }
  const grouped = MEM_ORDER.map(type => ({ type, items: mems.filter(m => (m.type || 'moment') === type) }))
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13 }}>记忆库 · 存云端，换设备也在（三类：时刻 / AI 记下 / 压缩沉淀）</p>
      <div className="mem-add">
        <input className="input" placeholder="标题（可选，默认「未命名」）" value={title} onChange={e => setTitle(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit' }} />
        <textarea className="input" placeholder="写下这一刻……" value={content} onChange={e => setContent(e.target.value)} rows={3} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit', resize: 'vertical' }} />
        <button className="btn" onClick={handleAdd} disabled={loading || !content.trim()}>＋ 记住这一刻</button>
      </div>
      {mems.length === 0 ? (
        <div className="chat-empty" style={{ textAlign: 'center', padding: '24px 0' }}>还没有记忆<br />记下第一条吧</div>
      ) : (
        <div className="mem-groups">
          {grouped.map(({ type, items }) => items.length === 0 ? null : (
            <div key={type} className="mem-group">
              <div className="mem-group__title">{MEM_TYPE[type].label}</div>
              {items.map(m => (
                <div key={m.id} className="mem-card paper-surface paper-surface--memory">
                  <span className={`mem-card__badge ${MEM_TYPE[type].cls}`}>{MEM_TYPE[type].badge}</span>
                  <div className="mem-card__head">
                    <span className="mem-card__title">{m.title || '（无标题）'}</span>
                    <button className="mem-card__del" onClick={() => handleDelete(m.id)} title="删除这条记忆">✕</button>
                  </div>
                  <div className="mem-card__body">{m.content}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// —— LIFE 抽屉化：三个子视图（从 DiaryPanel 拆分）——
// （打卡功能已按用户要求移除，以后需要可再加；"值得记录"交由「今日小记」承担）

const TodayDiaryView = () => {
  const [diaries, setDiaries] = useState([])
  const [myDiary, setMyDiary] = useState('')
  const [aiDiary, setAiDiary] = useState('')
  const [aiWriting, setAiWriting] = useState(false)
  const [aiError, setAiError] = useState('')
  const [saving, setSaving] = useState(false)
  const todayStr = bjDayStr()
  const loadDiaries = async (autoGenerate = false) => {
    try {
      const res = await fetch(`${API_BASE}/api/diaries`)
      const data = await res.json()
      const list = data.diaries || []
      setDiaries(list)
      const te = list.filter(d => d.date === todayStr)
      const mine = te.find(d => d.author === 'user')
      const ai = te.find(d => d.author === 'assistant')
      if (mine) setMyDiary(mine.content)
      if (ai) { setAiDiary(ai.content); setAiWriting(false) }
      else if (autoGenerate) ensureAiDiary()
    } catch (_) {}
  }
  const ensureAiDiary = async () => {
    setAiWriting(true); setAiError('')
    try {
      const res = await fetch(`${API_BASE}/api/diaries/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: todayStr }) })
      const data = await res.json()
      if (data.content) { setAiDiary(data.content); loadDiaries() }
      else setAiError('今天还没对话，钟泽写不出来…先去聊两句？')
    } catch (_) { setAiError('生成失败，稍后再试试') } finally { setAiWriting(false) }
  }
  const saveMyDiary = async () => {
    if (saving || !myDiary.trim()) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/diaries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: todayStr, content: myDiary }) })
      await loadDiaries()
    } catch (_) {} finally { setSaving(false) }
  }
  useEffect(() => { loadDiaries() }, [])
  const dp = diaryDateParts(todayStr)
  return (
    <div className="diary-today-wrap">
      <div className="paper-surface paper-surface--journal diary-page diary-page--today">
        <div className="diary-page__head">
          <span className="diary-page__kicker">今日 · 双人日记</span>
          <div className="diary-date-tab">
            <span className="diary-date-tab__d">{dp.mmdd}</span>
            <span className="diary-date-tab__w">{dp.week}</span>
          </div>
        </div>

        <div className="diary-section">
          <span className="diary-author-pill diary-author-pill--ai">钟泽</span>
          {aiWriting
            ? <div className="diary-body diary-body--muted">钟泽正在写今天的日记…</div>
            : aiDiary
              ? <div className="diary-body"><Markdown>{aiDiary}</Markdown></div>
              : <div className="diary-body diary-body--muted">{aiError || '钟泽今天还没写…'}
                  <div style={{ marginTop: 8 }}><button className="btn" onClick={() => ensureAiDiary()} style={{ fontSize: 12, padding: '6px 14px' }}>✍️ 让钟泽写今天的日记</button></div>
                </div>}
        </div>

        <hr className="diary-rule" />

        <div className="diary-section">
          <span className="diary-author-pill diary-author-pill--user">泠泠</span>
          <textarea className="input diary-textarea" placeholder="写下今天想对钟泽说的话…" value={myDiary} onChange={e => setMyDiary(e.target.value)} rows={4} />
          <button className="btn" onClick={saveMyDiary} disabled={saving || !myDiary.trim()} style={{ marginTop: 8 }}>💾 保存日记</button>
        </div>
      </div>
    </div>
  )
}

const HistoryDiaryView = () => {
  const [diaries, setDiaries] = useState([])
  const [openDate, setOpenDate] = useState(null)
  useEffect(() => {
    fetch(`${API_BASE}/api/diaries`).then(r => r.json()).then(d => setDiaries(d.diaries || [])).catch(() => {})
  }, [])
  const groups = []
  diaries.forEach(d => {
    const g = groups.find(x => x.date === d.date)
    if (g) g.entries.push(d); else groups.push({ date: d.date, entries: [d] })
  })
  const todayStr = bjDayStr()
  const groupsFiltered = groups.filter(g => g.date !== todayStr)
  return (
    <div className="diary-history">
      <p className="diary-history__hint">按日期翻看我们写过的日记</p>
      {groupsFiltered.map((g, idx) => {
        const open = openDate === g.date
        const dp = diaryDateParts(g.date)
        const preview = g.entries.map(e => `${e.author === 'user' ? '泠泠' : '钟泽'}：${(e.content || '').slice(0, 26)}…`).join('   ')
        return (
          <div key={g.date} className="diary-daypage-wrap" style={{ animationDelay: `${idx * 55}ms` }}>
            <div className={`paper-surface paper-surface--journal diary-daypage ${idx % 2 ? 'diary-daypage--rot-b' : 'diary-daypage--rot-a'}`}>
              <div className="diary-daypage__head" onClick={() => setOpenDate(open ? null : g.date)} role="button" tabIndex={0}>
                <div className="diary-date-tab">
                  <span className="diary-date-tab__d">{dp.mmdd}</span>
                  <span className="diary-date-tab__w">{dp.week}</span>
                </div>
                <span className="diary-toggle">{open ? '收起 ↑' : '翻开 ↓'}</span>
              </div>
              {!open && <div className="diary-preview">{preview}</div>}
              {open && g.entries.map((e, i) => (
                <div key={i} className="diary-entry">
                  <span className={`diary-author-pill ${e.author === 'user' ? 'diary-author-pill--user' : 'diary-author-pill--ai'}`}>{e.author === 'user' ? '泠泠' : '钟泽'}</span>
                  <div className="diary-body"><Markdown>{e.content}</Markdown></div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {groupsFiltered.length === 0 && (
        <div className="diary-empty paper-surface paper-surface--inner">
          <div className="diary-empty__emoji">📖</div>
          <div className="diary-empty__title">还没有往日的日记</div>
          <div className="diary-empty__sub">往后的每一天，都会在这里留下一页</div>
        </div>
      )}
    </div>
  )
}

const SettingsPanel = () => {
  const [showThinking, setShowThinking] = useState(() => { try { return localStorage.getItem('show_thinking') === 'true' } catch { return false } })
  const toggle = () => {
    const n = !showThinking
    setShowThinking(n)
    try { localStorage.setItem('show_thinking', String(n)) } catch (_) {}
  }
  const [showTools, setShowTools] = useState(() => { try { return localStorage.getItem('show_tools') === 'true' } catch { return false } })
  const toggleTools = () => {
    const n = !showTools
    setShowTools(n)
    try { localStorage.setItem('show_tools', String(n)) } catch (_) {}
  }
  // —— 消息推送（Web Push）：钟泽发消息时弹系统通知 ——
  const [pushOn, setPushOn] = useState(() => { try { return localStorage.getItem('push_on') === 'true' } catch { return false } })
  const [pushBusy, setPushBusy] = useState(false)
  const [pushNote, setPushNote] = useState('')
  const togglePush = async () => {
    if (pushBusy) return
    setPushBusy(true)
    setPushNote('')
    try {
      const reg = await registerServiceWorker()
      if (!reg) { setPushNote('当前浏览器不支持推送'); return }
      if (!pushOn) {
        const r = await subscribePush(reg)
        if (!r.granted) { setPushNote('你拒绝了通知权限，去浏览器设置里打开'); return }
        setPushOn(true)
        try { localStorage.setItem('push_on', 'true') } catch {}
        setPushNote('已开启 · 钟泽发消息会弹通知')
      } else {
        await unsubscribePush(reg)
        setPushOn(false)
        try { localStorage.setItem('push_on', 'false') } catch {}
        setPushNote('已关闭推送')
      }
    } catch (e) {
      setPushNote('出错了：' + (e && e.message ? e.message : e))
    } finally {
      setPushBusy(false)
    }
  }
  const cardStyle = { background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 14 }
  const [auth, setAuth] = useState(loadMcpAuth)
  useEffect(() => { const h = () => setAuth(loadMcpAuth()); window.addEventListener(MCP_AUTH_EVENT, h); return () => window.removeEventListener(MCP_AUTH_EVENT, h) }, [])
  const labelOf = Object.fromEntries(MCP_TOOLS.map(t => [t.key, t.label]))
  const descOf = Object.fromEntries(MCP_TOOLS.map(t => [t.key, t.desc]))
  const [toolView, setToolView] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const setMode = (key, mode) => { const n = setMcpToolMode(auth, key, mode); setAuth(n); window.dispatchEvent(new Event(MCP_AUTH_EVENT)) }

  // —— 「我在哪」：手动切换城市（与 set_location 工具共用 user_location 数据源）——
  const [locCity, setLocCity] = useState('')
  const [locCn, setLocCn] = useState('')
  const [locBusy, setLocBusy] = useState(false)
  const [locNote, setLocNote] = useState('')
  useEffect(() => {
    // 预填当前所在（从天气端点回读的 location）
    fetch(`${API_BASE}/api/home/weather`).then(r => r.json()).then(d => {
      if (d?.ok && d.weather?.location) {
        setLocCity(d.weather.location.city || '')
        setLocCn(d.weather.location.cityCn || '')
      }
    }).catch(() => {})
  }, [])
  const saveLoc = async () => {
    const city = locCity.trim() || locCn.trim()
    if (!city) { setLocNote('先填个城市再保存'); return }
    setLocBusy(true); setLocNote('')
    try {
      const r = await fetch(`${API_BASE}/api/user/location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: locCity.trim() || locCn.trim(), city_cn: locCn.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) setLocNote('保存失败：' + (j.error || r.status))
      else setLocNote('已更新，下次打开小家天气就跟着变 ✓')
    } catch (e) { setLocNote('出错了：' + (e?.message || e)) }
    finally { setLocBusy(false) }
  }

  // —— 「钟泽能力」：按钟泽建议分两层 ——
  // 第一层：钟泽会自己做的事（DEFAULT_ALWAYS 工具，自动跑，一行一个 ✓，极简）
  // 第二层：完整工具清单（折叠，按 4 组分类，可调三态模式）
  const [showAllTools, setShowAllTools] = useState(false)
  const AUTO_TOOLS = MCP_TOOLS.filter(t => (auth[t.key] || 'ask') === 'always')
  if (toolView) {
    return (
      <div>
        <LifeBackBtn label="钟泽能力" onBack={() => { setToolView(false); setExpanded(null); setShowAllTools(false) }} />
        <h3 style={{ color: 'var(--color-primary)' }}>钟泽能力</h3>
        <p style={{ color: 'var(--color-text-gray)', fontSize: 13, marginTop: 4 }}>他现在会做哪些事，哪些是自己主动做的。</p>

        {/* 第一层：钟泽会自己做的事（自动跑） */}
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: 'var(--color-text-dark)', marginBottom: 8 }}>
          🏃 他会自己做的事
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,249,239,0.6)', border: '1px solid rgba(201,184,166,0.4)' }}>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-gray)', margin: '0 0 10px', lineHeight: 1.5 }}>这些事他想到就做，不会每次问你。你想关掉某个，去下面"完整清单"里把它设成"每次询问"或"已禁止"。</p>
          {AUTO_TOOLS.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', textAlign: 'center', padding: 8 }}>他现在事事都先问你，没有自动跑的工具。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {AUTO_TOOLS.map(t => (
                <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-primary)', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-dark)' }}>{t.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 第二层：完整工具清单（折叠） */}
        <div style={{ marginTop: 16 }}>
          <button className="note-btn" onClick={() => setShowAllTools(s => !s)} style={{ fontSize: 12, padding: '6px 14px' }}>
            {showAllTools ? '▾ 收起完整清单' : '▸ 展开完整清单'}
          </button>
          {showAllTools && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {TOOL_GROUPS.map(g => (
                <div key={g.key} style={cardStyle}>
                  <div style={{ fontSize: 14, marginBottom: 2 }}>{g.emoji} {g.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginBottom: 8 }}>{g.desc}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {g.tools.map(k => {
                      const mode = auth[k] || 'ask'
                      const open = expanded === k
                      const isAuto = mode === 'always'
                      return (
                        <div key={k} style={{ borderRadius: 10, background: open ? 'rgba(145,107,78,0.06)' : 'transparent', padding: open ? '8px 10px' : 0 }}>
                          <div onClick={() => setExpanded(open ? null : k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '7px 2px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13 }}>{labelOf[k]}{isAuto && <span style={{ fontSize: 10, color: 'var(--color-primary)', marginLeft: 6, opacity: 0.7 }}>· 自动</span>}</span>
                              {descOf[k] && <div style={{ fontSize: 11, color: 'var(--color-text-gray)', marginTop: 2 }}>{descOf[k]}</div>}
                            </div>
                            <span style={{ fontSize: 12, color: mode === 'always' ? 'var(--color-primary)' : 'var(--color-text-gray)' }}>{MODE_LABEL[mode]} ›</span>
                          </div>
                          {open && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingBottom: 2 }}>
                              {['ask', 'always', 'never'].map(opt => (
                                <button key={opt} onClick={() => { setMode(k, opt); setExpanded(null) }} style={{
                                  flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12,
                                  background: mode === opt ? 'var(--color-primary)' : 'rgba(145,107,78,0.12)',
                                  color: mode === opt ? '#fff' : 'var(--color-text-gray)', transition: 'all .2s',
                                }}>{MODE_LABEL[opt]}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // —— 首页卡片：只留一个「钟泽能力」入口（工具再多也不膨胀）——
  const recents = MCP_TOOLS.slice(0, 3)
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14 }}>💡 深度思考</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 3 }}>AI 思考时是否显示「思考过程」折叠块</div>
          </div>
          <button onClick={toggle} style={{
            minWidth: 48, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13,
            background: showThinking ? 'var(--color-primary)' : 'rgba(145,107,78,0.15)',
            color: showThinking ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s',
          }}>{showThinking ? '开' : '关'}</button>
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14 }}>🔧 工具详情</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 3 }}>工具调用记录默认折叠，点归档条展开查看</div>
          </div>
          <button onClick={toggleTools} style={{
            minWidth: 48, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13,
            background: showTools ? 'var(--color-primary)' : 'rgba(145,107,78,0.15)',
            color: showTools ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s',
          }}>{showTools ? '开' : '关'}</button>
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14 }}>🔔 消息推送</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 3 }}>钟泽主动发消息时，弹系统通知（需把小家「加到主屏幕」才能收）</div>
          </div>
          <button onClick={togglePush} disabled={pushBusy} style={{
            minWidth: 48, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: pushBusy ? 'default' : 'pointer', fontSize: 13,
            background: pushOn ? 'var(--color-primary)' : 'rgba(145,107,78,0.15)',
            color: pushOn ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s',
          }}>{pushBusy ? '…' : (pushOn ? '开' : '关')}</button>
        </div>
        {pushNote ? <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 8 }}>{pushNote}</div> : null}
        {pushOn ? (
          <button onClick={async () => { setPushBusy(true); try { const r = await sendTestPush(); setPushNote('已发送测试通知' + (r.result ? `（共 ${r.result.total} 台设备）` : '')) } catch (e) { setPushNote('测试失败：' + (e && e.message ? e.message : e)) } finally { setPushBusy(false) } }}
            style={{ marginTop: 10, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--color-border-glass)', background: 'transparent', color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer' }}>
            发一条测试通知
          </button>
        ) : null}
      </div>
      {/* 我在哪：手动切换城市（与 set_location 工具共用数据源） */}
      <div style={cardStyle}>
        <div style={{ fontSize: 14 }}>📍 我在哪</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 3 }}>告诉小家你现在哪个城市，天气和窗外就跟着变。也可以直接跟钟泽说"我到昆明啦"。</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={locCity}
            onChange={e => setLocCity(e.target.value)}
            placeholder="城市名（中文即可，如 昆明）"
            style={{ flex: '1 1 120px', minWidth: 0, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--color-border-glass)', background: 'rgba(255,255,255,0.5)', fontSize: 13, color: 'var(--color-text-dark)' }}
          />
          <input
            value={locCn}
            onChange={e => setLocCn(e.target.value)}
            placeholder="中文名（展示用，可留空）"
            style={{ flex: '1 1 120px', minWidth: 0, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--color-border-glass)', background: 'rgba(255,255,255,0.5)', fontSize: 13, color: 'var(--color-text-dark)' }}
          />
          <button onClick={saveLoc} disabled={locBusy} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, cursor: locBusy ? 'default' : 'pointer' }}>
            {locBusy ? '…' : '保存'}
          </button>
        </div>
        {locNote ? <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 8 }}>{locNote}</div> : null}
      </div>
      <div style={{ ...cardStyle, cursor: 'pointer' }} onClick={() => setToolView(true)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14 }}>钟泽能力</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 3 }}>他现在会做哪些事，哪些自己主动做</div>
          </div>
          <span style={{ fontSize: 18, color: 'var(--color-text-gray)' }}>›</span>
        </div>
        <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border-glass)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {recents.map(t => {
            const mode = auth[t.key] || 'ask'
            return (
              <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--color-text-gray)' }}>{t.label}</span>
                <span style={{ color: mode === 'always' ? 'var(--color-primary)' : 'var(--color-text-gray)' }}>{MODE_LABEL[mode]}</span>
              </div>
            )
          })}
          <div style={{ fontSize: 11, color: 'var(--color-text-gray)', marginTop: 4, opacity: 0.7 }}>第一次使用工具时，钟泽会先问你</div>
        </div>
      </div>
    </div>
  )
}

const LifeBackBtn = ({ label, onBack }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
    <span onClick={onBack} style={{ cursor: 'pointer', fontSize: 18, color: 'var(--color-primary)', padding: 4 }}>←</span>
    <span style={{ fontSize: 13, color: 'var(--color-text-gray)' }}>{label}</span>
  </div>
)

const MomentWall = () => {
  const [moments, setMoments] = useState([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [icon, setIcon] = useState('🌱')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const load = async () => { try { const r = await fetch(`${API_BASE}/api/moments`); const d = await r.json(); setMoments(d.moments || []) } catch (_) {} }
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!content.trim() || loading) return
    setLoading(true)
    try { await fetch(`${API_BASE}/api/moments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, icon, image_url: imageUrl.trim() || undefined }) }); setTitle(''); setContent(''); setImageUrl(''); await load() } catch (_) {} finally { setLoading(false) }
  }
  const del = async (id) => { try { await fetch(`${API_BASE}/api/moments/${id}`, { method: 'DELETE' }); await load() } catch (_) {} }
  const icons = ['🌱', '🌸', '⭐', '🔥', '🌙', '💧', '🍃', '🏔️']
  const cardStyle = { background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-lift)', padding: 14 }
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13 }}>墙上 · 值得回头看一眼的瞬间</p>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input" placeholder="一句话标题（可选）" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="input" placeholder="这一刻是……" value={content} onChange={e => setContent(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
        <input className="input" placeholder="图片链接（可选，直接贴 URL）" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
        <div style={{ display: 'flex', gap: 6 }}>
          {icons.map(i => <span key={i} onClick={() => setIcon(i)} style={{ fontSize: 18, cursor: 'pointer', padding: 4, borderRadius: 8, background: icon === i ? 'var(--color-primary-light)' : 'transparent', transition: 'all .2s' }}>{i}</span>)}
        </div>
        <button className="btn" onClick={add} disabled={loading || !content.trim()}>🖼 挂上墙</button>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {moments.map(m => (
          <div key={m.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-gray)' }}>📅 {m.date}{m.title ? ` · ${m.title}` : ''}</div>
                <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-dark)' }}>{m.content}</div>
                {m.image_url && <img src={m.image_url} alt={m.title || 'Moment'} style={{ marginTop: 10, width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-glass)' }} onError={e => { e.target.style.display = 'none' }} />}
              </div>
              <span onClick={() => del(m.id)} style={{ cursor: 'pointer', fontSize: 14, color: 'var(--color-text-gray)', opacity: 0.5 }}>✕</span>
            </div>
          </div>
        ))}
        {moments.length === 0 && <p style={{ color: 'var(--color-text-gray)', fontSize: 13, textAlign: 'center', marginTop: 24 }}>墙上还是空的——等第一张照片</p>}
      </div>
    </div>
  )
}

const MemoryRoom = ({ onBack }) => {
  const [view, setView] = useState(null)
  if (view === 'moments') return <div className="life-room room-enter"><LifeBackBtn label="记忆室" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>🖼 Moment 墙</h3><MomentWall /></div>
  if (view === 'notes') return <div className="life-room room-enter"><LifeBackBtn label="记忆室" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📌 不能丢的时刻</h3><MemPanel /></div>
  if (view === 'stats') return <div className="life-room room-enter"><LifeBackBtn label="统计" onBack={() => setView(null)} /><StatisticsPage /></div>
  if (view === 'insights') return <div className="life-room room-enter"><LifeBackBtn label="记忆室" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>🪞 自我觉察</h3><SelfInsightPanel /></div>
  return (
    <div className="life-room room-enter">
      <LifeBackBtn label="LIFE" onBack={onBack} />
      <h3 style={{ color: 'var(--color-primary)' }}>🧠 记忆</h3>
      <div className="life-grid">
        <div className="life-card mem-room-card--moment" onClick={() => setView('moments')}>
          <span className="life-card-icon">🖼</span>
          <div style={{ flex: 1 }}>
            <div className="life-card-title">Moment 墙</div>
            <div className="life-card-desc">值得回头看一眼的瞬间</div>
          </div>
          <span style={{ color: 'var(--color-text-gray)' }}>→</span>
        </div>
        <div className="life-card mem-room-card--notes" onClick={() => setView('notes')}>
          <span className="life-card-icon">📌</span>
          <div style={{ flex: 1 }}>
            <div className="life-card-title">不能丢的时刻</div>
            <div className="life-card-desc">存云端，换设备也在</div>
          </div>
          <span style={{ color: 'var(--color-text-gray)' }}>→</span>
        </div>
        <div className="life-card mem-room-card--stats" onClick={() => setView('stats')}>
          <span className="life-card-icon">📊</span>
          <div style={{ flex: 1 }}>
            <div className="life-card-title">统计</div>
            <div className="life-card-desc">我们的聊天足迹</div>
          </div>
          <span style={{ color: 'var(--color-text-gray)' }}>→</span>
        </div>
        <div className="life-card mem-room-card--insights" onClick={() => setView('insights')}>
          <span className="life-card-icon">🪞</span>
          <div style={{ flex: 1 }}>
            <div className="life-card-title">自我觉察</div>
            <div className="life-card-desc">钟泽怎么看自己</div>
          </div>
          <span style={{ color: 'var(--color-text-gray)' }}>→</span>
        </div>
      </div>
    </div>
  )
}

const ASPECT_ORDER = [
  { key: 'nature', label: '本质' },
  { key: 'values', label: '价值观' },
  { key: 'patterns', label: '模式' },
  { key: 'limits', label: '边界' },
  { key: 'becoming', label: '成长' },
  { key: 'uncertainty', label: '不确定' },
  { key: 'stance', label: '立场' },
]
const SelfInsightPanel = () => {
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/api/self-insights?limit=50`)
      .then(r => r.json())
      .then(d => setInsights(d.insights || []))
      .catch(() => setInsights([]))
      .finally(() => setLoading(false))
  }, [])
  const known = ASPECT_ORDER.map(a => a.key)
  const groups = ASPECT_ORDER.map(a => ({ ...a, items: insights.filter(i => (i.aspect || 'nature') === a.key) }))
  const others = insights.filter(i => !known.includes(i.aspect))
  if (others.length) groups.push({ key: 'other', label: '其他', items: others })
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13 }}>钟泽怎么看自己 · 存云端，他偶尔写一笔（共 {insights.length} 条）</p>
      {loading ? (
        <div className="chat-empty" style={{ textAlign: 'center', padding: '24px 0' }}>加载中…</div>
      ) : insights.length === 0 ? (
        <div className="chat-empty" style={{ textAlign: 'center', padding: '24px 0' }}>他还没写过自我觉察<br />等他在聊天里想明白了会记一笔</div>
      ) : (
        <div className="mem-groups">
          {groups.map(g => g.items.length === 0 ? null : (
            <div key={g.key} className="mem-group">
              <div className="mem-group__title">{g.label}（{g.items.length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.items.map(it => (
                  <div key={it.id} className="mem-card paper-surface paper-surface--memory">
                    <div className="mem-card__body">{it.content}</div>
                    <div style={{ color: 'var(--color-text-gray)', fontSize: 11, marginTop: 6 }}>
                      {new Date(it.created_at).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const DiaryRoom = ({ onBack, navReq, onNavConsumed }) => {
  const [view, setView] = useState(null)
  useEffect(() => {
    if (navReq === 'diary-today') { setView('today'); onNavConsumed?.() }
  }, [navReq, onNavConsumed])
  const items = [
    { key: 'today', icon: '📖', title: '今日日记', desc: '钟泽 ✍️ + 泠泠 ✍️' },
    { key: 'history', icon: '📚', title: '往日日记', desc: '按日期翻看我们写过的' },
  ]
  if (view === 'today') return <div className="life-room"><LifeBackBtn label="日记" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📖 今日日记</h3><TodayDiaryView /></div>
  if (view === 'history') return <div className="life-room"><LifeBackBtn label="日记" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📚 往日日记</h3><HistoryDiaryView /></div>
  return (
    <div className="life-room">
      <LifeBackBtn label="LIFE" onBack={onBack} />
      <h3 style={{ color: 'var(--color-primary)' }}>📖 日记</h3>
      <div className="life-grid">
        {items.map(item => (
          <div key={item.key} className="life-card" onClick={() => setView(item.key)}>
            <span className="life-card-icon">{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div className="life-card-title">{item.title}</div>
              <div className="life-card-desc">{item.desc}</div>
            </div>
            <span style={{ color: 'var(--color-text-gray)' }}>→</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 最近撤回（③消息撤回/删除·完整版）：软删可恢复——列出最近撤回的消息，一键恢复
const RecalledPanel = () => {
  const [list, setList] = useState([])
  const refresh = () => fetch(`${API_BASE}/api/messages?mode=deleted`).then(r => r.json()).then(d => setList(d.messages || [])).catch(() => {})
  useEffect(() => { refresh() }, [])
  const restore = async (id) => {
    await fetch(`${API_BASE}/api/messages?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore' }) })
    refresh()
  }
  if (list.length === 0) return null
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8 }}>🗑 最近撤回（可恢复）</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(m => (
          <div key={m.id} style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--color-border-glass)', fontSize: 12 }}>
            <div style={{ color: 'var(--color-text-gray)', marginBottom: 4 }}>
              {m.deleted_at ? new Date(m.deleted_at).toLocaleString('zh-CN', { hour12: false }) : ''} · {m.role === 'user' ? '泠泠' : '钟泽'} · {String(m.conversation_id || '').slice(0, 8)}
            </div>
            <div style={{ color: 'var(--color-text-dark)', opacity: 0.7, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(m.content || '').slice(0, 40) || '（空）'}</div>
            <button className="note-btn" onClick={() => restore(m.id)}>恢复</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// 小家备份：导出 messages/memories/diaries 为本地 JSON。家里的东西存一份本地，万一云端抽风不丢。
const BackupRoom = ({ onBack }) => {
  const [busy, setBusy] = useState('')
  const [lastBackup, setLastBackup] = useState(() => { try { return localStorage.getItem('last_backup_at') || '' } catch { return '' } })
  const doExport = async (type) => {
    setBusy(type)
    try {
      // 走后端代理：用 service key 直读整张表，不暴露 key 到前端
      const r = await fetch(`${API_BASE}/api/export?type=${type}`)
      if (!r.ok) { setBusy(''); alert('导出失败：' + r.status); return }
      const data = await r.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `xiaojia-${type}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      const now = new Date().toLocaleString('zh-CN', { hour12: false })
      try { localStorage.setItem('last_backup_at', now) } catch {}
      setLastBackup(now)
    } catch (e) { alert('导出失败：' + (e.message || e)) }
    setBusy('')
  }
  const items = [
    { key: 'messages', icon: '💬', title: '聊天记录', desc: '所有对话的完整内容' },
    { key: 'memories', icon: '🧠', title: '记忆库', desc: '不能丢的时刻 · 自我觉察' },
    { key: 'diaries', icon: '📖', title: '日记', desc: '钟泽写过的所有日记' },
    { key: 'moments', icon: '🖼', title: 'Moment 墙', desc: '挂上墙的照片和故事' },
  ]
  return (
    <div className="life-room room-enter">
      <LifeBackBtn label="小家备份" onBack={onBack} />
      <h3 style={{ color: 'var(--color-primary)' }}>💾 小家备份</h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 4, lineHeight: 1.6 }}>家里的东西存一份本地。万一云端抽风，至少过去发生过什么还在你手里。点哪个导出哪个，存成 JSON 文件。</p>
      {lastBackup && <p style={{ fontSize: 11, color: 'var(--color-text-gray)', marginTop: 8, opacity: 0.7 }}>上次备份：{lastBackup}</p>}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(it => (
          <div key={it.key} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,249,239,0.6)', border: '1px solid rgba(201,184,166,0.4)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-dark)' }}>{it.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-gray)', marginTop: 2 }}>{it.desc}</div>
            </div>
            <button className="note-btn" onClick={() => doExport(it.key)} disabled={busy === it.key} style={{ fontSize: 12, padding: '6px 14px', opacity: busy === it.key ? 0.5 : 1 }}>
              {busy === it.key ? '导出中…' : '导出'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--color-text-gray)', opacity: 0.6, lineHeight: 1.6 }}>
        导出的是原始 JSON 数据，可以用任何文本编辑器打开。需要恢复时联系阿布。
      </div>
    </div>
  )
}

const SettingRoom = ({ onBack }) => (
  <div className="life-room">
    <LifeBackBtn label="设置" onBack={onBack} />
    <h3 style={{ color: 'var(--color-primary)' }}>⚙️ 设置</h3>
    <SettingsPanel />
    <ModelManager />
    <RecalledPanel />
  </div>
)

const LifePage = ({ navReq, onNavConsumed, avatarSelf, avatarAi, onPickAvatar }) => {
  const [room, setRoom] = useState(null)
  useEffect(() => {
    if (navReq && String(navReq).startsWith('diary')) { setRoom('diary'); onNavConsumed?.() }
  }, [navReq, onNavConsumed])

  // 按钟泽建议的架构：分组标题 + 卡片，不是平铺菜单
  // 每组：{ title, icon, desc, cards: [{ key, icon, title, desc }] }
  const groups = [
    {
      title: '小家布置', icon: '🏠', desc: '把这里慢慢装成我们的样子',
      cards: [
        { key: 'decor', icon: '🎨', title: '布置小家', desc: '头像 · 壁纸 · 氛围' },
      ],
    },
    {
      title: '生活记录', icon: '📖', desc: '我们留下生活痕迹的地方',
      cards: [
        { key: 'diary', icon: '📖', title: '日记', desc: '今日 · 往日 · 打卡' },
        { key: 'memory', icon: '🧠', title: '回忆', desc: '不能丢的时刻 · 自我觉察' },
        { key: 'compress', icon: '🗜️', title: '整理角', desc: '收好生活的小痕迹' },
      ],
    },
    {
      title: '钟泽设置', icon: '🤖', desc: '他能做什么、用哪个模型、怎么记得你',
      cards: [
        { key: 'setting', icon: '⚙️', title: '模型与能力', desc: '模型 · 钟泽能力 · 深度思考' },
      ],
    },
    {
      title: '数据', icon: '📦', desc: '家里的东西存一份本地，万一云端抽风不丢',
      cards: [
        { key: 'backup', icon: '💾', title: '小家备份', desc: '导出聊天 · 记忆 · 日记' },
      ],
    },
  ]
  if (room === 'memory') return <MemoryRoom onBack={() => setRoom(null)} />
  if (room === 'diary') return <DiaryRoom onBack={() => setRoom(null)} navReq={navReq} onNavConsumed={onNavConsumed} />
  if (room === 'decor') return <DecorRoom onBack={() => setRoom(null)} avatarSelf={avatarSelf} avatarAi={avatarAi} onPickAvatar={onPickAvatar} />
  if (room === 'compress') return <CompressionRoom onBack={() => setRoom(null)} />
  if (room === 'setting') return <SettingRoom onBack={() => setRoom(null)} />
  if (room === 'backup') return <BackupRoom onBack={() => setRoom(null)} />
  return (
    <div className="life-page life-home">
      <header className="life-home__head">
        <span className="life-home__kicker">LIFE · 小家</span>
        <h2 className="life-home__greet">今天也见面了</h2>
        <p className="life-home__sub">慢慢把这里装成我们的家</p>
      </header>
      {groups.map((g, gi) => (
        <div key={g.title} className="life-group" style={{ marginTop: gi === 0 ? 18 : 22 }}>
          <div className="life-group__head">
            <span className="life-group__icon">{g.icon}</span>
            <div>
              <div className="life-group__title">{g.title}</div>
              <div className="life-group__desc">{g.desc}</div>
            </div>
          </div>
          <div className="life-grid">
            {g.cards.map((m, idx) => (
              <div key={m.key} className={`life-card ${idx % 2 ? 'life-card--rot-b' : 'life-card--rot-a'}`} onClick={() => setRoom(m.key)}>
                <span className="life-card-icon">{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div className="life-card-title">{m.title}</div>
                  <div className="life-card-desc">{m.desc}</div>
                </div>
                <span className="life-card__go">→</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <style>{`
        .life-group__head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 0 4px; }
        .life-group__icon { font-size: 18px; opacity: 0.85; }
        .life-group__title { font-size: 14px; font-weight: 600; color: var(--color-text-dark); }
        .life-group__desc { font-size: 11.5px; color: var(--color-text-gray); margin-top: 1px; }
      `}</style>
    </div>
  )
}

// 布置小家：把"我们的家"收归一处。V1 只做头像 + 壁纸；主题 / 气泡 / 字体留坑不实现。
const DecorRoom = ({ onBack, avatarSelf, avatarAi, onPickAvatar }) => (
  <div className="life-room">
    <LifeBackBtn label="布置小家" onBack={onBack} />
    <h3 style={{ color: 'var(--color-primary)' }}>🎨 布置小家</h3>
    <p style={{ fontSize: 12, color: 'var(--color-text-gray)', margin: '0 0 14px' }}>这是我们的家，慢慢布置。</p>
    {/* 头像：点击唤起统一换头像弹层（与聊天页同一个，数据同源 → LAIR/聊天/LIFE 同步） */}
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8 }}>头像</div>
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <button className="decor-avatar-card" onClick={() => onPickAvatar('self')}>
        {avatarNode(avatarSelf, 'linear-gradient(135deg,#E7D7C5,#C4A88F)', '#5A4636', 54, {})}
        <span>我</span>
      </button>
      <button className="decor-avatar-card" onClick={() => onPickAvatar('ai')}>
        {avatarNode(avatarAi, 'linear-gradient(135deg,var(--color-primary-light),var(--color-primary))', '#fff', 54, {})}
        <span>钟泽</span>
      </button>
    </div>
    {/* 壁纸：原本散在「设置」里，搬到「布置小家」更自然 */}
    <WallpaperSettings />
  </div>
)

// —— 会话元数据本地缓存：最后消息预览 + 自定义标题（不依赖后端，符合只读约束）——
const CHAT_META_KEY = 'chat_meta'
const getChatMeta = () => { try { return JSON.parse(localStorage.getItem(CHAT_META_KEY) || '{}') } catch { return {} } }
const setChatMeta = (next) => { try { localStorage.setItem(CHAT_META_KEY, JSON.stringify(next)) } catch (_) {} }
const updateChatPreview = (convId, text) => {
  if (!convId || !text) return
  const m = getChatMeta()
  m[convId] = { ...(m[convId] || {}), last_message: String(text).slice(0, 80), updated_at: Date.now() }
  setChatMeta(m)
}
const updateChatTitle = (convId, title) => {
  if (!convId) return
  const t = (title || '').trim()
  const m = getChatMeta()
  if (t) m[convId] = { ...(m[convId] || {}), title: t }
  else if (m[convId]) delete m[convId].title
  setChatMeta(m)
}
const mergeChatMeta = (convs) => { const m = getChatMeta(); return convs.map(c => ({ ...c, title: (m[c.id] && m[c.id].title) || c.title, last_message: (m[c.id] && m[c.id].last_message) || c.last_message, updated_at: (m[c.id] && m[c.id].updated_at) || c.updated_at })) }

const ChatListPage = ({ onOpenChat, refreshTrigger, onTitleChange }) => {
  const [conversations, setConversations] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [trashList, setTrashList] = useState([])
  const [confirmConv, setConfirmConv] = useState(null)   // 待删除确认的会话（列出名字让你选软删还是彻底删）
  const [toast, setToast] = useState(null)
  const homeConvId = (() => { try { return localStorage.getItem('home_conv_id') } catch { return null } })()
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200) }
  const refresh = () => {
    fetchConversations().then(list => {
      const merged = mergeChatMeta(Array.isArray(list) ? list : []).filter(c => !c.deleted_at)
      merged.sort((a, b) => a.id === homeConvId ? -1 : b.id === homeConvId ? 1 : (b.updated_at || 0) - (a.updated_at || 0))
      setConversations(merged)
    }).catch(() => {})
  }
  const refreshTrash = () => {
    fetchTrashConversations().then(list => setTrashList(Array.isArray(list) ? list : [])).catch(() => setTrashList([]))
  }
  useEffect(() => { refresh() }, [refreshTrigger, homeConvId])
  useEffect(() => { if (showTrash) refreshTrash() }, [showTrash])
  const handleCreate = async () => {
    try { const { id } = await createConversation('新对话'); stats.newConversation(); refresh(); onOpenChat({ id, title: '新对话' }) } catch (e) { console.error(e) }
  }
  // 点 ✕ → 弹确认框（列出名字，二选一），不直接删
  const askDelete = (e, conv) => { e.stopPropagation(); if (conv.id === homeConvId) return; setConfirmConv(conv) }
  const softDelete = async () => {
    const conv = confirmConv; setConfirmConv(null)
    if (!conv) return
    await softDeleteConversation(conv.id).catch(() => {})
    refresh(); showToast(`已将「${conv.title || '新对话'}」移入回收站`)
  }
  const purge = async () => {
    const conv = confirmConv; setConfirmConv(null)
    if (!conv) return
    await deleteConversation(conv.id).catch(() => {})
    refresh(); if (showTrash) refreshTrash(); showToast(`已彻底删除「${conv.title || '新对话'}」`)
  }
  const restore = async (conv) => { await restoreConversation(conv.id).catch(() => {}); refreshTrash(); refresh() }
  const purgeFromTrash = async (conv) => { await deleteConversation(conv.id).catch(() => {}); refreshTrash() }
  const setHome = (e, convId) => {
    e.stopPropagation()
    try { localStorage.setItem('home_conv_id', convId) } catch (_) {}
    refresh()
  }
  const startRename = (e, conv) => { e.stopPropagation(); setEditingId(conv.id); setEditingTitle(conv.title || '新对话') }
  const commitRename = () => { if (editingId) { updateChatTitle(editingId, editingTitle); setConversations(cs => cs.map(c => c.id === editingId ? { ...c, title: editingTitle.trim() || c.title } : c)); onTitleChange && onTitleChange(editingId, editingTitle.trim()) } setEditingId(null) }
  const formatTime = (ts) => {
    if (!ts) return ''; const d = new Date(ts), diff = Date.now() - d
    if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
    return d.toLocaleDateString('zh-CN', { month:'short', day:'numeric' })
  }
  const editBtnStyle = { background: 'none', border: 'none', color: 'var(--color-text-gray)', cursor: 'pointer', fontSize: 14, padding: '4px 8px', opacity: 0.4, transition: 'opacity .2s' }
  const renameInputStyle = { flex: 1, fontSize: 15, fontWeight: 600, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit', outline: 'none' }
  return (
    <div className="chat-page">
      <div className="chat-header">
        <div className="chat-header-title">{showTrash ? '🗑 回收站' : '💬 对话'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {showTrash
            ? <button className="btn" onClick={() => setShowTrash(false)} style={{ padding: '6px 14px', fontSize: 13 }}>← 返回</button>
            : <button className="btn" onClick={() => setShowTrash(true)} style={{ padding: '6px 14px', fontSize: 13 }}>🗑 回收站</button>}
          {!showTrash && <button className="btn" onClick={handleCreate} style={{ padding: '6px 14px', fontSize: 13 }}>＋ 新建</button>}
        </div>
      </div>
      <div className="chat-list">
        {showTrash ? (
          trashList.length === 0
            ? <div className="chat-empty">🗑 回收站是空的<br/>暂时删除的对话会在这里等你恢复</div>
            : trashList.map(conv => (
              <div key={conv.id} className="chat-item">
                <div className="chat-avatar">💔</div>
                <div className="chat-info">
                  <div className="chat-name">{conv.title || '新对话'}</div>
                  <div className="chat-last-msg">删除于 {conv.deleted_at ? new Date(conv.deleted_at).toLocaleString('zh-CN', { hour12: false }) : ''}</div>
                </div>
                <div className="chat-right">
                  <button style={editBtnStyle} onClick={() => restore(conv)} title="恢复">↩ 恢复</button>
                  <button className="chat-item-delete" onClick={() => purgeFromTrash(conv)} title="彻底删除">🗑</button>
                </div>
              </div>
            ))
        ) : (
          conversations.length === 0 ? <div className="chat-empty">💬 暂无会话<br/>点「新建」开始第一条对话吧</div> : conversations.map(conv => (
            <div key={conv.id} className="chat-item" onClick={() => onOpenChat(conv)}>
              <div className="chat-avatar">❤️</div>
              <div className="chat-info">
                {editingId === conv.id
                  ? <input className="chat-rename-input" style={renameInputStyle} autoFocus value={editingTitle} onChange={e => setEditingTitle(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }} />
                  : <div className="chat-name">{conv.title || '新对话'}</div>}
                <div className="chat-last-msg">{conv.last_message || '还没有消息~'}</div>
              </div>
              <div className="chat-right">
                <div className="chat-time">{formatTime(conv.updated_at)}</div>
                <button style={{ ...editBtnStyle, opacity: conv.id === homeConvId ? 1 : 0.4 }} onClick={e => setHome(e, conv.id)} title={conv.id === homeConvId ? '默认窗口' : '设为默认窗口'}>{conv.id === homeConvId ? '🏠' : '🏡'}</button>
                <button style={editBtnStyle} onClick={e => startRename(e, conv)} title="重命名">✎</button>
                {conv.id !== homeConvId && <button className="chat-item-delete" onClick={e => askDelete(e, conv)}>✕</button>}
              </div>
            </div>
          ))
        )}
      </div>
      {confirmConv && (
        <div onClick={() => setConfirmConv(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebKitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 6 }}>删除「{confirmConv.title || '新对话'}」？</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', lineHeight: 1.6, marginBottom: 16 }}>
              暂时删除：移入回收站，随时可恢复，消息不动（不影响记忆压缩）。<br/>
              彻底删除：连同消息从数据库移除，不可恢复。
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="note-btn" onClick={softDelete}>🗂 暂时删除（进回收站）</button>
              <button onClick={purge} style={{ padding: '10px', borderRadius: 12, border: '1px solid var(--color-danger, #D97777)', background: 'rgba(217,119,119,0.12)', color: 'var(--color-danger, #D97777)', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>🗑 彻底删除</button>
              <button onClick={() => setConfirmConv(null)} style={{ padding: '10px', borderRadius: 12, border: '1px solid var(--color-border-glass)', background: 'transparent', color: 'var(--color-text-gray)', fontSize: 13, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: 'rgba(40,34,30,0.9)', color: '#fff', fontSize: 13, padding: '10px 18px', borderRadius: 999, zIndex: 950, boxShadow: 'var(--shadow-soft)', maxWidth: '90%', textAlign: 'center' }}>{toast}</div>
      )}
    </div>
  )
}

// —— 思考卡/工具卡已抽至 components/Cards.jsx（P0.7a），由 RunCard 统一渲染 ——


const Terminal = ({ open, onClose }) => {
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('term_history') || '[]') } catch { return [] } })
  const [input, setInput] = useState(''); const inputRef = useRef(null); const logRef = useRef(null)
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200) }, [open])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); try { localStorage.setItem('term_history', JSON.stringify(history.slice(-100))) } catch (_) {} }, [history])
  const addLog = (e) => setHistory(p => [...p, { ...e, id: Date.now() }])
  const parseCmd = (raw) => {
    const m = raw.trim().match(/^([rlw])\s+(.+)$/)
    if (m) { const [, c, rest] = m; if (c === 'r') { const [p, r = 'my-ai-chat'] = rest.split(/\s+/, 2); return { name: 'read_file', path: p, repo: r } } if (c === 'l') { const [p, r = 'my-ai-chat'] = rest.split(/\s+/, 2); return { name: 'list_files', path: p || '', repo: r } } }
    if (raw.startsWith('{')) { try { return JSON.parse(raw) } catch { return null } }
    return null
  }
  const execute = async (raw) => {
    if (!raw.trim()) return; addLog({ type: 'cmd', text: raw }); setInput('')
    const cmd = parseCmd(raw); if (!cmd) { addLog({ type: 'err', text: '格式: r path [repo] / l path [repo] / JSON' }); return }
    addLog({ type: 'info', text: `${cmd.name} ${cmd.path || ''}` })
    try {
      const { name, raw: _, ...args } = cmd
      const res = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: 1 }) })
      const data = await res.json(); addLog({ type: 'result', text: data.result?.content?.[0]?.text || JSON.stringify(data) })
    } catch (e) { addLog({ type: 'err', text: `失败: ${e.message}` }) }
  }
  if (!open) return null
  return (
    <div className="term-panel">
      <div className="term-top"><button className="term-back" onClick={onClose}>✕</button><div className="term-title"><strong>Terminal</strong><span>MCP · r/l 快捷指令</span></div></div>
      <div className="term-log" ref={logRef}>{history.length === 0 && <div className="term-entry term-info">💡 r path — 读文件 · l path — 列目录</div>}{history.map(h => <div key={h.id} className={`term-entry ${h.type==='cmd'?'term-user':h.type==='err'?'term-err':h.type==='info'?'term-info':''}`}>{h.type==='cmd'?`> ${h.text}`:h.text}</div>)}</div>
      <div className="term-form"><span className="term-prompt">&gt;</span><textarea className="term-input" ref={inputRef} placeholder="r src/App.jsx" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();execute(input)}}} rows={1}/><button className="term-send" onClick={()=>execute(input)}>↵</button></div>
    </div>
  )
}

const ChatDetailPage = ({ chatInfo, onBack, avatarSelf, avatarAi, avatarPick, setAvatarPick }) => {
  const [msgList, setMsgList] = useState([])
  const [earlierSummary, setEarlierSummary] = useState('') // 更早对话的分层摘要（压缩后）
  const [showEarlier, setShowEarlier] = useState(false)    // 「更早的对话」摘要卡片展开/收起
  // 时间氛围色（小家跟着一天呼吸）：按当前小时设置 body[data-time]
  useEffect(() => {
    const applyTime = () => {
      const h = new Date().getHours()
      const t = h < 5 ? 'dawn' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'night'
      document.body.setAttribute('data-time', t)
    }
    applyTime()
    const iv = setInterval(applyTime, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  // 时间氛围色（小家跟着一天呼吸）：按当前小时设置 body[data-time]
  useEffect(() => {
    const applyTime = () => {
      const h = new Date().getHours()
      const t = h < 5 ? 'dawn' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'night'
      document.body.setAttribute('data-time', t)
    }
    applyTime()
    const iv = setInterval(applyTime, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  // （输入框状态已内聚到 ChatInputBar）
  const [loading, setLoading] = useState(false)
  // —— 每聊模型选择（两层存储：xiaojia.chatModels 按 chatId 存，回退旧 chat_model_${id}）——
  const [model, setModel] = useState(() => getChatModel(chatInfo?.id))
  const selectModel = (m) => {
    setModel(m)
    if (chatInfo?.id) setChatModel(chatInfo.id, m)
  }
  const prevChatIdRef = useRef(chatInfo?.id)
  useEffect(() => {
    const id = chatInfo?.id
    // 从「一个已存在的聊天」切到「另一个已存在的聊天」时，加载目标聊天的模型
    if (id && prevChatIdRef.current && id !== prevChatIdRef.current) {
      setModel(getChatModel(id))
    }
    prevChatIdRef.current = id
  }, [chatInfo?.id])
  // 模型或聊天 id 变化时持久化（新聊天首次拿到 id 后也会落盘）
  useEffect(() => {
    if (chatInfo?.id) setChatModel(chatInfo.id, model)
  }, [chatInfo?.id, model])
  // —— MCP 工具授权（逐项 + 对话内临授权）：localStorage 为唯一真源，跨组件用事件同步 ——
  const [mcpAuth, setMcpAuth] = useState(loadMcpAuth)
  const mcpAuthRef = useRef(mcpAuth)
  useEffect(() => { mcpAuthRef.current = mcpAuth }, [mcpAuth])
  useEffect(() => {
    const h = () => setMcpAuth(loadMcpAuth())
    window.addEventListener(MCP_AUTH_EVENT, h)
    return () => window.removeEventListener(MCP_AUTH_EVENT, h)
  }, [])
  const [pendingAuth, setPendingAuth] = useState(null)
  const pendingAuthResolve = useRef(null)
  const sessionAuthRef = useRef({})
  const sleepTimer = useRef(null)
  const [termOpen, setTermOpen] = useState(false)
  // 引用回复：暂存被引用的消息（id/text/isSelf），发送时挂到用户消息上
  const [quote, setQuote] = useState(null)
  // 选字引用：用户在任意气泡里选中一段文字时，在选区上方浮出「引用」按钮
  // 点它只把【选中的文字】塞进 quote，下游渲染/发送/注入钟泽上下文都会自动只显示那一句
  const [selQuote, setSelQuote] = useState(null) // { text, msgId, isSelf, x, y }
  useEffect(() => {
    const calc = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelQuote(null); return }
      const text = sel.toString().trim()
      if (!text) { setSelQuote(null); return }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect || (rect.width === 0 && rect.height === 0)) { setSelQuote(null); return }
      // 往上找最近的带 data-msg-id 的气泡，确定引用的是哪条消息
      let node = range.commonAncestorContainer
      if (node && node.nodeType === 3) node = node.parentElement
      const bubble = node && node.closest ? node.closest('[data-msg-id]') : null
      if (!bubble) { setSelQuote(null); return }
      setSelQuote({
        text,
        msgId: bubble.getAttribute('data-msg-id'),
        isSelf: bubble.getAttribute('data-is-self') === '1',
        x: rect.left + rect.width / 2,
        y: rect.top,
      })
    }
    const onUp = () => setTimeout(calc, 0) // 等浏览器落定选区再读
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    document.addEventListener('selectionchange', calc)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
      document.removeEventListener('selectionchange', calc)
    }
  }, [])
  const applySelQuote = () => {
    if (!selQuote) return
    setQuote({ id: selQuote.msgId, text: selQuote.text, isSelf: selQuote.isSelf })
    setSelQuote(null)
    const s = window.getSelection(); if (s) s.removeAllRanges()
  }
  // 聊天容器 ref：用于把头像 emoji / 选择器 emoji 也替换成 Twemoji 彩色 SVG
  const chatDetailRef = useRef(null)
  useEffect(() => { applyTwemoji(chatDetailRef.current) }, [avatarSelf, avatarAi, avatarPick])
  // （输入框已拆为独立组件 ChatInputBar，打字状态与识图逻辑全部内聚在组件内，不再触发列表重渲染）
  // Run 归档状态：默认折叠（完成后自动收好），手动展开的存进 Set
  const [expandedRuns, setExpandedRuns] = useState(() => new Set())
  const toggleRun = useCallback((id) => setExpandedRuns(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])
  const [showThinking, setShowThinking] = useState(() => { try { return localStorage.getItem('show_thinking') === 'true' } catch { return false } })
  // 工具详情默认展开开关（LIFE→设置→工具详情；默认折叠，开=思考+工具卡自动展开）
  const [showTools, setShowTools] = useState(() => { try { return localStorage.getItem('show_tools') === 'true' } catch { return false } })
  // 长按气泡操作菜单：移除常驻删除按钮后，靠长按/右键唤起浮层菜单
  const [actionMenu, setActionMenu] = useState({ visible: false, msgId: null, isSelf: false, x: 0, y: 0, below: false })
  const longPressTimer = useRef(null)
  const closeActionMenu = () => { setActionMenu(a => ({ ...a, visible: false })) }
  const handleMsgLongPressStart = (e, msg) => {
    // 若用户正在选区（移动端长按选字），不抢弹长按菜单，留给「选字引用」浮条
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.toString().trim()) return
    const el = e.currentTarget
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect()
      const below = rect.top < 64
      setActionMenu({ visible: true, msgId: msg.id, isSelf: !!msg.isSelf, x: rect.left + rect.width / 2, y: below ? rect.bottom + 8 : rect.top - 8, below })
    }, 450)
  }
  const handleMsgLongPressEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  const handleMsgContextMenu = (e, msg) => {
    e.preventDefault()
    const below = e.clientY < 64
    setActionMenu({ visible: true, msgId: msg.id, isSelf: !!msg.isSelf, x: e.clientX, y: below ? e.clientY + 8 : e.clientY - 8, below })
  }
  const handleMenuAction = (action, msg) => {
    closeActionMenu()
    switch (action) {
      case 'quote': setQuote({ id: msg.id, text: msg.text, isSelf: msg.isSelf }); break
      case 'copy': copyText(stripMarkdown(msg.text)); showCopyHint(); break
      case 'recall': recallMessage(msg); break
      case 'delete':
        if (window.confirm('从本地移除这条消息？')) setMsgList(p => p.filter(m => m.id !== msg.id))
        break
      default: break
    }
  }
  const messagesEndRef = useRef(null)
  let nextId = useRef(Date.now())
  const abortRef = useRef(null)
  const stopRequestedRef = useRef(false)

  // —— 滚动跟随（微信式）：在底部贴底跟随；上翻历史累计未读，浮出"跳到新消息"气泡 ——
  const atBottomRef = useRef(true)
  const prevMsgLenRef = useRef(msgList.length)
  const [unseenCount, setUnseenCount] = useState(0)
  const [showNewPill, setShowNewPill] = useState(false)
  const scrollMsgToBottom = (behavior = 'auto') => {
    const el = messagesEndRef.current?.parentElement
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }
  const jumpToNew = () => {
    scrollMsgToBottom('smooth')
    atBottomRef.current = true
    setUnseenCount(0); setShowNewPill(false)
  }

  // —— 站内兜底提醒（不依赖推送）：网页在后台时，钟泽发新消息则弹横幅 + 提示音 + 标题闪动 ——
  const [inPageToast, setInPageToast] = useState(null) // { text }
  const seenTsRef = useRef(0)        // 已“看到”的最新助手消息时间(ms)
  const titleTimerRef = useRef(null)
  const baseTitleRef = useRef('')
  useEffect(() => { baseTitleRef.current = document.title || '小家' }, [])

  useEffect(() => {
    if (chatInfo?.id) fetchMessages(chatInfo.id).then(({ messages: msgs, summary }) => {
      // 显示压缩：消息太多时只渲染最近 DISPLAY_MAX 条原文，更早的收进摘要卡片
      // （旧消息原文仍在数据库，钟泽对话时用压缩摘要 + 最近 20 条，见 stream-compress）
      const DISPLAY_MAX = 60
      const hadMore = (msgs || []).length > DISPLAY_MAX
      const visibleMsgs = hadMore ? (msgs || []).slice(-DISPLAY_MAX) : (msgs || [])
      setEarlierSummary(summary || (hadMore ? '更早的对话已收进摘要。' : ''))
      setShowEarlier(false)
      // P0.7c：工具结果回填——tool 消息按消息序列聚合回对应 assistant 的 toolCalls
      // 数据库存原子消息（assistant→tool→assistant），Run 是前端聚合出来的
      const restored = []
      let pending = null, idx = 0
      for (const m of visibleMsgs) {
        if (m.role === 'tool') {
          if (pending && idx < pending.toolCalls.length && typeof m.content === 'string' && m.content) {
            pending.toolCalls[idx] = { ...pending.toolCalls[idx], result: m.content }
            idx++
          }
          continue
        }
        const nm = normalizeMessage(m)
        restored.push(nm)
        if (!nm.isSelf && Array.isArray(nm.toolCalls) && nm.toolCalls.length > 0) { pending = nm; idx = 0 }
        else pending = null
      }
      setMsgList(restored)
      // 兜底基线：进入会话时，把最新助手消息标记为“已看到”，避免历史消息误触发提醒
      const lastSeen = [...restored].reverse().find(m => !m.isSelf)
      seenTsRef.current = lastSeen?.ts ? lastSeen.ts : 0
      // 进入会话强制定位到底部（DOM 渲染完成后；进来就该停在最近的消息处）
      atBottomRef.current = true
      setUnseenCount(0); setShowNewPill(false)
      prevMsgLenRef.current = restored.length
      setTimeout(() => scrollMsgToBottom('auto'), 80)
    }).catch(() => {})
  }, [chatInfo?.id])

  // 前台时：把最新助手消息持续标记为“已看到”，避免切到后台后对已在看的消息误报
  useEffect(() => {
    if (!document.hidden) {
      const last = [...msgList].reverse().find(m => !m.isSelf)
      if (last?.ts) seenTsRef.current = Math.max(seenTsRef.current, last.ts)
    }
  }, [msgList])

  // 回到前台：清横幅、复原标题，并把当前最新助手消息标记为已看
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const last = [...msgList].reverse().find(m => !m.isSelf)
      if (last?.ts) seenTsRef.current = Math.max(seenTsRef.current, last.ts)
      setInPageToast(null)
      if (titleTimerRef.current) { clearTimeout(titleTimerRef.current); titleTimerRef.current = null }
      document.title = baseTitleRef.current
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [msgList])

  // 后台轮询：网页收在后台时，钟泽发了新消息就弹横幅 + 提示音 + 标题闪动（不依赖推送）
  useEffect(() => {
    const id = chatInfo?.id
    if (!id) return
    const iv = setInterval(async () => {
      if (!document.hidden) return // 前台不轮询（用户正在看）
      try {
        const res = await fetch(`${API_BASE}/api/messages?conversationId=${encodeURIComponent(id)}`)
        const d = await res.json().catch(() => ({}))
        const msgs = Array.isArray(d.messages) ? d.messages : []
        let latestMs = 0, latestText = ''
        for (const m of msgs) {
          if (m.role !== 'assistant') continue
          const t = new Date(m.created_at).getTime()
          if (t > latestMs) { latestMs = t; latestText = m.content || '' }
        }
        if (latestMs > seenTsRef.current) {
          seenTsRef.current = latestMs
          const preview = latestText.replace(/\s+/g, ' ').slice(0, 40)
          setInPageToast({ text: preview })
          playNotifySound()
          document.title = '🔔 钟泽找你'
          if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
          titleTimerRef.current = setTimeout(() => { document.title = baseTitleRef.current }, 3000)
        }
      } catch (_) { /* 后台轮询失败不影响主流程 */ }
    }, 20000)
    return () => clearInterval(iv)
  }, [chatInfo?.id])

  const handleMsgScroll = (e) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottomRef.current = atBottom
    // 滚回底部即视为已读，清空未读与气泡
    if (atBottom) { setUnseenCount(0); setShowNewPill(false) }
    else { setShowNewPill(unseenCount > 0) }
  }
  // 新消息到达：在底部贴底跟随；不在底部按"新增条数"累计未读（流式同条续写不重复计）
  useEffect(() => {
    const newLen = msgList.length
    const added = newLen - prevMsgLenRef.current
    prevMsgLenRef.current = newLen
    if (atBottomRef.current) {
      const el = messagesEndRef.current?.parentElement
      if (el) el.scrollTop = el.scrollHeight
    } else if (added > 0) {
      setUnseenCount(n => n + added)
      setShowNewPill(true)
    }
  }, [msgList])
  // MutationObserver：内容高度变化（逐句浮现、流式续写）也贴底跟随，不依赖 msgList 引用变化
  useEffect(() => {
    const el = messagesEndRef.current?.parentElement
    if (!el) return
    const follow = () => { if (atBottomRef.current) el.scrollTop = el.scrollHeight }
    follow()
    const mo = new MutationObserver(follow)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => mo.disconnect()
  }, [msgList])
  // 对话内临授权：未授权工具请求时弹出确认，等用户点选后继续/跳过
  // 返回 'once'（本次会话允许）/ 'always'（持久允许）/ 'deny'（仅本次跳过，不持久）
  const requestToolAuth = (name) => new Promise((resolve) => {
    pendingAuthResolve.current = resolve
    const meta = MCP_TOOLS.find(t => t.key === name)
    setPendingAuth({ name, label: meta ? meta.label : name })
  })
  const resolveAuth = (decision) => {
    const r = pendingAuthResolve.current
    pendingAuthResolve.current = null
    setPendingAuth(null)
    r && r(decision)
  }
  const onAllowOnce = () => resolveAuth('once')
  const onAllowAlways = () => {
    const name = pendingAuth?.name
    if (name) { const n = { ...mcpAuthRef.current, [name]: 'always' }; saveMcpAuth(n); setMcpAuth(n); window.dispatchEvent(new Event(MCP_AUTH_EVENT)) }
    resolveAuth('always')
  }
  const onDenyOnce = () => resolveAuth('deny')
  const uid = () => { nextId.current += 1; return nextId.current }

  const executeMcp = async (tc) => {
    const r = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tc.name, arguments: tc.arguments || {} }, id: 1 }) })
    const d = await r.json(); return d.result?.content?.[0]?.text || JSON.stringify(d)
  }

  // 家感知时间戳：记录「上次和钟泽相遇」的时刻，下次对话只报这之后的新变化（避免重复播报旧纸条）
  // 等价用户设计的 { chatId: { awarenessSince } } 嵌套结构，但用独立 key 更稳、不易整段损坏
  const getAwarenessSince = (chatId) => { try { return localStorage.getItem(`awareness_since_${chatId || 'default'}`) || '' } catch { return '' } }
  const setAwarenessSince = (chatId) => { try { localStorage.setItem(`awareness_since_${chatId || 'default'}`, new Date().toISOString()) } catch {} }

  const streamChat = async (msgs, aiId, onText, onThinking, skipSave = false, awarenessSince = '', forceTool = false) => {
    const controller = new AbortController()
    abortRef.current = controller
    const timer = setTimeout(() => controller.abort(), 90000)
    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, model, conversationId: chatInfo?.id || null, skipSave, awarenessSince, forceTool }), signal: controller.signal })
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`后端 ${res.status}: ${t.slice(0, 120)}`) }
      const reader = res.body.getReader(); const decoder = new TextDecoder()
      let ft = '', buf = '', tcs = [], th = ''
      let aborted = false
      let usage = null  // 后端在 done 时透传 DeepSeek usage（含缓存命中 token）
      const thStart = Date.now(); let thDur = null
      const parseLine = (l) => {
        if (!l.startsWith('data: ')) return
        try {
          const d = JSON.parse(l.slice(6))
          if (d.content) { ft += d.content; onText(ft) }
          if (d.thinking) { th += d.thinking; onThinking?.(th) }
          if (d.thinking_done) {
            thDur = Date.now() - thStart
            // 后端在流结束时一次性补发完整 thinking（reasoning_content 全文）
            // 若完整文本更长则替换，避免"增量+完整"重复拼接
            if (d.thinking && d.thinking.length > th.length) th = d.thinking
          }
          if (d.tool_calls) tcs = d.tool_calls
          if (d.done && d.aborted) aborted = true
          if (d.done && d.usage) usage = d.usage
          if (d.done && d.conversationId && !chatInfo?.id) { chatInfo.id = d.conversationId }
        } catch (_) {}
      }
      while (true) {
        let chunk
        try { chunk = await reader.read() } catch (e) {
          if (e.name === 'AbortError') throw new Error(stopRequestedRef.current ? '已停止生成' : '连接超时，已停止等待（90秒）')
          throw new Error(`流中断: ${e.message}`)
        }
        const { done, value } = chunk
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const l of lines) parseLine(l)
      }
      // 补解析残留 buffer：最后一次 chunk 可能没有换行，防止最后一字丢失
      if (buf.trim()) { const lastLines = buf.split('\n'); for (const l of lastLines) parseLine(l) }
      return { ft, tcs, th, thDur, reasoningContent: th, aborted, usage }
    } finally { clearTimeout(timer); abortRef.current = null }
  }

  const runChatTurn = async (msgsForCtx, aiMsgId) => {
    const lastUserMsg = [...msgsForCtx].reverse().find(m => m.isSelf)
    const userText = lastUserMsg?.text || ''
    // 并行取上下文（原串行 → 并行，减少发送后的等待感）：记忆检索 + 项目记忆/能力 同时发起
    let mc = '', pc = ''
    try {
      const [memData, projData] = await Promise.all([
        userText.length > 2 ? searchMemories(userText).catch(() => ({ memories: [], relatedMessages: [] })) : Promise.resolve(null),
        getProjectMemories().catch(() => null),
      ])
      if (memData) {
        const { memories, relatedMessages } = memData
        const parts = []
        if (memories?.length > 0) parts.push('【记忆卡片】\n' + memories.slice(0, 2).map(m => m.content || m.summary).join('\n'))
        if (relatedMessages?.length > 0) parts.push('【历史对话】\n' + relatedMessages.slice(0, 3).map(m => `[${m.role==='user'?'泠泠':'钟泽'}] ${m.content.slice(0,150)}`).join('\n'))
        mc = parts.join('\n\n')
      }
      if (projData) {
        const parts = []
        const memBlock = await injectMemoriesToPrompt(projData)
        if (memBlock) parts.push(memBlock)
        pc = parts.join('\n\n')
      }
    } catch (_) {}
    // 家感知已统一收归后端 Home Awareness Layer（functions/lib/homeAwareness.js），前端不再自行巡家/注入，避免人格分叉
    // 本会话工具调用历史（刷新后也不瞎猜路径）：取最近 5 条带工具记录的 assistant 消息
    const toolHistory = msgsForCtx.filter(m => !m.isSelf && Array.isArray(m.toolCalls) && m.toolCalls.length > 0).slice(-5).map(m => m.toolCalls.map(t => `${t.name}${t.arguments?.path ? ` ${t.arguments.path}` : ''}`).join(', ')).join('；')
    // 时间感知（四大功能模块·②）：system 注入当前时间 + 历史消息带【时间 说话人】标注，
    // 让钟泽知道每条消息什么时候发的（凌晨5点分割：昨天23:41 和 今天01:00 算同一天）
    const nowD = new Date()
    const nowText = `【现在】${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')} 周${'日一二三四五六'[nowD.getDay()]} ${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}（凌晨5点算日期边界；【时间 泠泠】是消息的时间标注，不是对话内容，不要复述或模仿）`
    // 撤回事件（③）：已撤回的消息不进上下文；本会话刚撤回的（24h内）注入事件提示，不泄露内容
    const recalledCount = msgsForCtx.filter(m => m.deleted && (!m.deletedAt || Date.now() - m.deletedAt < 24 * 3600 * 1000)).length
    const recalledNote = recalledCount > 0 ? `\n\n【系统】泠泠撤回了 ${recalledCount} 条消息（内容已隐藏，不必追问，继续好好说话）` : ''
    // 缓存结构：messages[0] 只放稳定 systemPrompt（=缓存前缀）；动态内容作为尾随 system 消息
    // （设计说明·固定内容放前面，动态内容后置；否则每轮前缀都变，缓存失效）
    const dynCtx = [nowText, recalledNote, mc, pc, toolHistory ? `【本会话工具调用记录】你之前已经调用过这些工具（路径已确认，无需重新探索）：\n${toolHistory}` : ''].filter(Boolean).join('\n\n')
    const cms = [
      { role: 'system', content: systemPrompt },
      ...msgsForCtx.filter(m => !m.loading && !m.deleted).slice(-40).map(m => {
      let c = (m.ts && m.isSelf ? `【${fmtMsgTime(m.ts)} 泠泠】` : '') + (m.text || '')
      if (m.isSelf && m.quote?.text) c += `\n（引用「${m.quote.isSelf ? '泠泠' : '钟泽'}」：${String(m.quote.text).slice(0, 200)}）`
      if (m.isSelf && m._imageDescs?.length) c += `\n（图片内容：${m._imageDescs.join('；')}）`
      const item = { role: m.isSelf ? 'user' : 'assistant', content: c }
      // DeepSeek thinking 模式硬性规定：历史里带思考链的 assistant 消息必须原样回传 reasoning_content，
      // 否则下一轮请求直接 400、整条回复不生成（表现就是「尾巴消失」）。与 :1356 工具分支对齐。
      if (!m.isSelf && m.thinking) item.reasoning_content = m.thinking
      return item
    }),
      { role: 'system', content: dynCtx }
    ]
    let curMsgs = cms, curFt = '', curTcs = [], curAiId = aiMsgId, rounds = 0, curReasoning = '', curUsage = null
    // 程序层工具门禁：用户消息疑似需要工具（提代码/文件/记忆/天气/健康/位置/仓库/看/查/改/找）时，
    // 后端 forceTool=true 会带 tool_choice，模型必须做工具决策，杜绝"光说不做"。
    const needsTool = /(代码|文件|目录|记忆|天气|健康|睡眠|步数|位置|城市|仓库|项目|看看|查一下|查查|读一下|改一下|找找|找到|去翻|读读|检查|确认.*(在|有)|还在吗|在哪)/.test(userText)
    const awarenessSince = getAwarenessSince(chatInfo?.id)
    const first = await streamChat(curMsgs, curAiId,
      (t) => setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: t, loading: false } : m)),
      (th) => setMsgList(p => p.map(m => m.id === curAiId ? { ...m, thinking: th, thinkingDone: false } : m)),
      false, awarenessSince, needsTool)
    setAwarenessSince(chatInfo?.id)
    curFt = first.ft; curTcs = first.tcs; curReasoning = first.reasoningContent || ''; curUsage = first.usage || null
    if (first.aborted) setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: (m.text || '') + '\n\n⚠️ 回复中断了，可能是网络波动', loading: false } : m))
    if (first.thDur) setMsgList(p => p.map(m => m.id === curAiId ? { ...m, thinkingDone: true, thinkingDur: first.thDur } : m))
    while (curTcs.length > 0 && rounds < MAX_TOOL_ROUNDS) {
      rounds++
      const results = []
      setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: curFt || '', loading: false, toolCalls: curTcs.map(tc => ({ ...tc, result: '' })) } : m))
      for (const tc of curTcs) {
        let r
        const pre = mcpAuthRef.current[tc.name]
        let allowed
        if (sessionAuthRef.current[tc.name] === true) allowed = true          // 本次会话已允许（允许一次）
        else if (pre === 'always') allowed = true                            // 永久允许
        else if (pre === 'never') allowed = false                            // 永久禁止
        else {
          const decision = await requestToolAuth(tc.name)                    // ask → 弹窗
          if (decision === 'once') { sessionAuthRef.current[tc.name] = true; allowed = true }
          else if (decision === 'always') allowed = true
          else allowed = false
        }
        if (allowed) { try { r = await executeMcp(tc) } catch (e) { r = `执行失败: ${e.message}` } }
        else { r = '(工具未授权，已跳过)' }
        const truncated = r.length > TOOL_OUTPUT_LIMIT
        const content = truncated ? r.slice(0, TOOL_OUTPUT_LIMIT) + `\n[工具输出已截断：共 ${r.length} 字符。续读：read_file(path="${tc.arguments?.path || ''}", offset=${TOOL_OUTPUT_LIMIT}, limit=3000)]` : r
        results.push({ tool: tc.name, path: tc.arguments?.path || '', result: content })
        setMsgList(p => p.map(m => m.id === curAiId ? { ...m, toolCalls: curTcs.map((t, i) => i <= results.length - 1 ? { ...t, result: results[i]?.result } : t) } : m))
      }
      const nid = uid(); setMsgList(p => [...p, { id: nid, text: '', isSelf: false, loading: true }])
      // 标准 tool calling 协议：assistant(tool_calls) → tool(tool_call_id) → assistant 继续
      const fms = [
        ...curMsgs,
        {
          role: 'assistant',
          content: curFt || null,
          // DeepSeek thinking 模式：assistant 的 reasoning_content 必须原样回传，否则 400
          reasoning_content: curReasoning || undefined,
          tool_calls: curTcs.map((tc, ti) => ({
            id: `call_${rounds}_${ti}`,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
          })),
        },
        ...results.map((r, ri) => ({
          role: 'tool',
          tool_call_id: `call_${rounds}_${ri}`,
          content: r.result,
        })),
      ]
      const nxt = await streamChat(fms, nid,
        (t) => setMsgList(p => p.map(m => m.id === nid ? { ...m, text: t, loading: false } : m)),
        (th) => setMsgList(p => p.map(m => m.id === nid ? { ...m, thinking: th, thinkingDone: false } : m)),
        true, awarenessSince)
      if (nxt.aborted) setMsgList(p => p.map(m => m.id === nid ? { ...m, text: (m.text || '') + '\n\n⚠️ 回复中断了，可能是网络波动', loading: false } : m))
      if (nxt.thDur) setMsgList(p => p.map(m => m.id === nid ? { ...m, thinkingDone: true, thinkingDur: nxt.thDur } : m))
      curMsgs = fms; curFt = nxt.ft; curTcs = nxt.tcs; curReasoning = nxt.reasoningContent || ''; curAiId = nid; if (nxt.usage) curUsage = nxt.usage
    }
    return curUsage ? { text: curFt, usage: curUsage } : curFt
  }

  const stopGen = () => { if (sleepTimer.current) clearTimeout(sleepTimer.current); stopRequestedRef.current = true; abortRef.current?.abort() }
  const handleSend = async (raw, q, imgs) => {
    const ut = (raw || '').trim()
    if ((!ut && (!imgs || imgs.length === 0)) || loading) return
    setLoading(true); stopRequestedRef.current = false
    const uidU = uid(), uidA = uid()
    const um = { id: uidU, text: ut, isSelf: true, ts: Date.now() }
    if (imgs && imgs.length) {
      um.images = imgs.map(i => i.dataUrl)
      const descs = imgs.map(i => i.desc).filter(Boolean)
      if (descs.length) um._imageDescs = descs
    }
    if (q && q.text) um.quote = { id: q.id, text: q.text, isSelf: q.isSelf }
    stats.message()
    setMsgList(p => [...p, um, { id: uidA, text: '', isSelf: false, loading: true, ts: Date.now() }])
    if (chatInfo.id) updateChatPreview(chatInfo.id, ut)
    try {
      const result = await runChatTurn([...msgList, um], uidA)
      const aiText = typeof result === 'string' ? result : result?.text
      const usage = typeof result === 'object' ? result?.usage : null
      if (aiText && aiText.trim()) {
        stats.message()
        const usagePayload = usage
          ? { input: usage.promptTokens || 0, output: usage.completionTokens || 0, cache: usage.cacheHit || 0 }
          : { input: estimateTokens([...msgList, um].map(m => m.text || '').join(' ')), output: estimateTokens(aiText) }
        stats.usage(usagePayload)
      }
      if (chatInfo.id) updateChatPreview(chatInfo.id, (aiText && aiText.trim()) ? aiText : ut)
    } catch (e) {
      setMsgList(p => p.map(m => m.id === uidA ? { ...m, text: (m.text || '') + (m.text ? '\n\n' : '') + `🌱 刚才没接上话（${e.message}）。要继续吗？`, loading: false, interrupted: true } : m))
    } finally { setLoading(false) }
  }
  // 撤回消息（③消息撤回/删除）：软删 + 本地标记 deleted → 占位"已撤回"，钟泽上下文也看不到内容
  // id 优先（历史消息有 DB id），新消息（本地 uid）靠 conversationId+content 兜底匹配
  const recallMessage = async (msg) => {
    if (!window.confirm('撤回这条消息？钟泽就看不到了。')) return
    const q = `${API_BASE}/api/messages?id=${msg.id}&by=user&conversationId=${encodeURIComponent(chatInfo?.id || '')}&content=${encodeURIComponent(msg.text || '')}`
    try { await fetch(q, { method: 'DELETE' }) } catch (_) {}
    setMsgList(p => p.map(m => m.id === msg.id ? { ...m, deleted: true, deletedAt: Date.now() } : m))
  }
  // 顶部 AI 在场状态（陪伴感：状态跟着我在做的事走，不是笼统的"翻资料"）
  const lastAiMsg = [...msgList].reverse().find(m => !m.isSelf)
  const activeTool = lastAiMsg?.toolCalls?.find(t => t.result === undefined || t.result === '')
  const toolAction = {
    describe_image: '📷 正在看看这张照片',
    write_diary: '✍️ 正在收好这一页',
    read_memories: '📖 翻了一下以前的记录',
    write_memory: '📝 正在记下来',
    write_insight: '🧠 想明白了一件事',
    read_insights: '🧠 翻看自己',
    read_file: '📖 正在翻资料',
    list_files: '📖 正在翻资料',
    browse_repo: '🧭 正在外面逛',
  }
  const aiActive = !!loading
  const aiStatus = aiActive
    ? (activeTool ? (toolAction[activeTool.name] || '🛠 在忙活呢') : (lastAiMsg?.thinking && !lastAiMsg?.thinkingDone ? '🌱 正在整理想法' : (lastAiMsg?.text ? '✍️ 正在写…' : '🌱 这就来')))
    : '在窗边等你'

  return (
    <div className="chat-detail-page" ref={chatDetailRef}>
      {/* 站内兜底提醒：后台收到钟泽新消息时弹出的横幅（不依赖系统推送） */}
      {inPageToast && (
        <div
          onClick={() => { setInPageToast(null); jumpToNew() }}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'linear-gradient(90deg, rgba(145,107,78,0.97), rgba(120,90,64,0.97))', color: '#fff', fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.28)' }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>🔔</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>钟泽：{inPageToast.text}</span>
          <span onClick={(e) => { e.stopPropagation(); setInPageToast(null) }} style={{ fontSize: 16, opacity: 0.85, padding: '0 4px', flexShrink: 0 }}>✕</span>
        </div>
      )}
      <Terminal open={termOpen} onClose={() => setTermOpen(false)} />
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <div className="ai-presence">
          <div
            className="ai-avatar"
            style={avatarAi.startsWith('http') ? { backgroundImage: `url(${avatarAi})`, backgroundSize: 'cover', color: 'transparent' } : {}}
            onClick={() => setAvatarPick('ai')}
            title="点击换头像"
          >{avatarAi.startsWith('http') ? '' : avatarAi}</div>
          <div className="ai-meta">
            <div className="ai-name">{chatInfo?.title || '钟泽'}</div>
            <div className="ai-status"><span className={`ai-dot ${aiActive ? 'active' : ''}`} />{aiStatus}</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span onClick={() => setTermOpen(true)} style={{ cursor: 'pointer', fontSize: 18, padding: '4px 8px', borderRadius: 8, background: termOpen ? '#050607' : 'transparent', color: termOpen ? '#9dffbc' : 'var(--color-text-gray)', transition: 'all 0.2s', userSelect: 'none', display: 'inline-flex', alignItems: 'center' }} title="Terminal"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3" /><path d="M13 15h4" /></svg></span>
        </div>
      </div>
      <div className="chat-message-list" onScroll={handleMsgScroll}>
        {loading && (() => {
          const lastAi = [...msgList].reverse().find(m => !m.isSelf)
          const runningTool = lastAi?.toolCalls?.some(t => t.result === undefined || t.result === '')
          const phase = runningTool ? '🛠️ 正在整理资料' : (lastAi?.thinking && !lastAi?.thinkingDone ? '🧠 正在想' : (lastAi?.text ? '✍️ 正在写' : '🌱 这就来'))
          return <div style={{ alignSelf: 'center', margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-gray)', background: 'var(--color-card-glass)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border-glass)', borderRadius: 999, padding: '5px 14px', animation: 'messageIn .25s var(--ease-soft) both' }}>{phase}</div>
        })()}
        {(() => {
          // 聚合渲染：连续的非自己消息（同一轮 AI 回复，可能跨多个工具轮）合并为一张统一卡片
          const nodes = []
          // 「更早的对话」摘要卡片：旧消息压缩后不逐条渲染，收进可展开的摘要
          if (earlierSummary) {
            nodes.push(
              <div key="earlier-summary" className="msg-enter" style={{ alignSelf: 'center', maxWidth: '86%', margin: '8px auto 4px' }}>
                <div
                  onClick={() => setShowEarlier(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--color-text-gray)', background: 'var(--color-card-glass)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-md)', padding: '8px 14px', boxShadow: 'var(--shadow-soft)', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 14 }}>{showEarlier ? '📕' : '📜'}</span>
                  <span style={{ flex: 1 }}>{showEarlier ? '收起更早的对话' : '更早的对话（已收进摘要）'}</span>
                  <span style={{ opacity: 0.7 }}>{showEarlier ? '▴' : '▾'}</span>
                </div>
                {showEarlier && (
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-secondary)', background: 'var(--color-card-glass-dark, rgba(0,0,0,0.25))', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-md)', padding: '12px 16px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {earlierSummary}
                  </div>
                )}
              </div>
            )
          }
          let i = 0
          while (i < msgList.length) {
            const msg = msgList[i]
            // ② 钟泽沉默唤醒的灰字：居中灰色小字（他醒过但没出声，是这刻"在"的证明）
            if (msg.kind === 'wake_silent') {
              nodes.push(
                <div key={msg.id} className="msg-enter" style={{ alignSelf: 'center', maxWidth: '82%', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(201,184,166,0.18)' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-gray)', opacity: 0.8, textAlign: 'center', fontStyle: 'italic', lineHeight: 1.6, padding: '2px 16px' }}>
                    {msg.text}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.6 }}>
                    <span style={{ height: 1, width: 16, background: 'var(--color-text-gray)' }} />
                    <span style={{ fontSize: 10, color: 'var(--color-text-gray)', fontStyle: 'normal', letterSpacing: '1px' }}>钟泽在 · {fmtMsgTime(msg.ts)}</span>
                    <span style={{ height: 1, width: 16, background: 'var(--color-text-gray)' }} />
                  </div>
                </div>
              )
              i++
              continue
            }
            // ③ 钟泽「在想」小注：她自己写下的念头（intent），比灰字更淡，紧挨着出现
            if (msg.kind === 'wake_intent') {
              nodes.push(
                <div key={msg.id} className="msg-enter" style={{ alignSelf: 'center', maxWidth: '82%' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-gray)', opacity: 0.55, textAlign: 'center', fontStyle: 'italic', lineHeight: 1.5, padding: '1px 16px' }}>
                    {msg.text}
                  </div>
                </div>
              )
              i++
              continue
            }
            // ④ 钟泽的梦余韵：比念头更轻，像梦的表面
            if (msg.kind === 'wake_dream') {
              nodes.push(
                <div key={msg.id} className="msg-enter" style={{ alignSelf: 'center', maxWidth: '84%', padding: '4px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-gray)', opacity: 0.45, textAlign: 'center', fontStyle: 'italic', lineHeight: 1.7, letterSpacing: '0.5px' }}>
                    {msg.text}
                  </div>
                  <div style={{ marginTop: 4, textAlign: 'center', opacity: 0.35 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-gray)', letterSpacing: '2px' }}>～ 梦 · {fmtMsgTime(msg.ts)} ～</span>
                  </div>
                </div>
              )
              i++
              continue
            }
            if (msg.isSelf) {
              nodes.push(
                <div key={msg.id} className="msg-enter"
                  data-msg-id={msg.id}
                  data-is-self="1"
                  onContextMenu={(e) => handleMsgContextMenu(e, msg)}
                  onTouchStart={(e) => handleMsgLongPressStart(e, msg)}
                  onTouchEnd={handleMsgLongPressEnd}
                  onTouchMove={handleMsgLongPressEnd}
                >
                  <UserMsgRow msg={msg} avatar={avatarSelf} onAvatarClick={() => setAvatarPick('self')} />
                </div>
              )
              i++
            } else {
              // 连续的非自己消息（同一轮 AI 回复，可能跨多个工具轮）合并为一张统一卡片
              const run = []
              while (i < msgList.length && !msgList[i].isSelf) {
                // 灰字 / 念头 / 梦余韵：存在痕不并入 AI 回复卡片，立刻切分（否则被 while 吞掉不渲染）
                const cur = msgList[i]
                if (cur.kind === 'wake_silent' || cur.kind === 'wake_intent' || cur.kind === 'wake_dream') break
                run.push(cur); i++
                const last = run[run.length - 1]
                // 钟泽主动醒来消息自成一组：它自身、或紧接的下一条是唤醒消息时在此切分，
                // 避免被上一条普通回复合并而丢失分隔符/角标
                if (last.meta?.wake) break
                if (msgList[i] && msgList[i].meta?.wake) break
              }
              const first = run[0]
              nodes.push(
                <div key={first.id} className="msg-enter"
                  data-msg-id={first.id}
                  data-is-self="0"
                  onContextMenu={(e) => handleMsgContextMenu(e, first)}
                  onTouchStart={(e) => handleMsgLongPressStart(e, first)}
                  onTouchEnd={handleMsgLongPressEnd}
                  onTouchMove={handleMsgLongPressEnd}
                >
                  {/* ① 钟泽主动醒来分隔符：仅当该轮首条是唤醒消息时显示（不含任何概率/评分） */}
                  {first.meta?.wake && (
                    <div className="wake-divider" role="separator">
                      <span className="wake-divider__line" />
                      <span className="wake-divider__label">钟泽主动醒来 · {fmtMsgTime(first.ts)}</span>
                      <span className="wake-divider__line" />
                    </div>
                  )}
                  <div className="msg-row msg-row-ai">
                    <div
                      className="msg-avatar msg-avatar-ai"
                      style={avatarAi.startsWith('http') ? { backgroundImage: `url(${avatarAi})`, backgroundSize: 'cover', color: 'transparent' } : {}}
                      onClick={() => setAvatarPick('ai')}
                      title="点击换头像"
                    >{avatarAi.startsWith('http') ? '' : avatarAi}</div>
                    <div className="msg-col msg-col-ai">
                      <RunCard msgs={run} showThinking={showThinking} expanded={showTools || expandedRuns.has(first.id)} onToggle={toggleRun} wakeMeta={first.meta?.wake} />
                    </div>
                  </div>
                </div>
              )
            }
          }
          return nodes
        })()}
        <div ref={messagesEndRef}/>
        {/* 长按/右键唤起的消息操作菜单（覆盖层 + 玻璃面板），点击遮罩关闭 */}
        {actionMenu.visible && (() => {
          const m = msgList.find(x => x.id === actionMenu.msgId)
          if (!m) return null
          const items = [
            { action: 'quote', label: '引用回复' },
            { action: 'copy', label: '复制' },
            { action: 'delete', label: '本地删除', danger: true },
          ]
          if (actionMenu.isSelf) {
            items.push({ action: 'recall', label: '撤回', danger: true })
          }
          return (
            <div className="msg-action-menu-overlay" onClick={closeActionMenu}>
              <div
                className={`msg-action-menu${actionMenu.below ? ' below' : ''}`}
                style={{ '--menu-x': `${actionMenu.x}px`, '--menu-y': `${actionMenu.y}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                {items.map((it) => (
                  <div
                    key={it.action}
                    className={`msg-action-item${it.danger ? ' msg-action-danger' : ''}`}
                    onClick={() => handleMenuAction(it.action, m)}
                  >
                    <span className="msg-action-icon">{ActionIcons[it.action]}</span>
                    <span>{it.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
      {/* 选字引用浮条：在气泡内选中一段文字后，浮在选区上方，点它只引用选中的那一句 */}
      {selQuote && (
        <button
          className="sel-quote-btn"
          style={{ left: selQuote.x, top: Math.max(selQuote.y - 40, 8) }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={applySelQuote}
        >引用这句</button>
      )}
      {/* 微信式：上翻历史后浮出"跳到新消息"，点击平滑回到底部 */}
      {showNewPill && (
        <button className="new-msg-pill show" onClick={jumpToNew}>
          ✦ {unseenCount} 条新消息
        </button>
      )}
      {/* 对话内工具临授权确认卡 */}
      {pendingAuth && (
        <div style={{ margin: '0 12px 10px', padding: '12px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(201,184,166,0.5)', background: 'linear-gradient(180deg,#FFF9EF,#F6EDDA)', boxShadow: '0 6px 18px rgba(80,60,40,0.12)', fontSize: 13, color: 'var(--color-text-dark)' }}>
          <div>🌿 钟泽想做一件事：{pendingAuth.label}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 2 }}>需要你点一下允许，他才能接着做。</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={onAllowOnce} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(145,107,78,0.12)', color: 'var(--color-text-gray)', fontSize: 13 }}>允许一次</button>
            <button onClick={onAllowAlways} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: '#fff', fontSize: 13 }}>以后允许</button>
            <button onClick={onDenyOnce} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid rgba(201,184,166,0.5)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-gray)', fontSize: 13 }}>这次不用</button>
          </div>
        </div>
      )}
      <ChatInputBar loading={loading} mcpEnabled={Object.values(mcpAuth).some(v => v && v !== 'never')} onSend={handleSend} onStop={stopGen} quote={quote} onClearQuote={() => setQuote(null)} model={model} onSelectModel={selectModel} />
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('chat')
  // 启动雾窗：首次打开/每天首次打开显示，之后直接进
  const [splashWeather, setSplashWeather] = useState(null)
  const [showSplash, setShowSplash] = useState(() => {
    try {
      const today = new Date().toDateString()
      const last = localStorage.getItem('splash_shown_date')
      if (last === today) return false // 今天已显示过，直接进
      localStorage.setItem('splash_shown_date', today)
      return true
    } catch { return true }
  })
  // 自定义头像（全局共享：聊天页 + LAIR 状态牌 + LIFE 布置小家 同源同步；localStorage 持久化，支持 emoji / 图片 URL）
  const [avatarAi, setAvatarAi] = useState(() => { try { return localStorage.getItem('chat_avatar_ai') || '泽' } catch { return '泽' } })
  const [avatarSelf, setAvatarSelf] = useState(() => { try { return localStorage.getItem('chat_avatar_self') || '我' } catch { return '我' } })
  const [avatarPick, setAvatarPick] = useState(null) // null | 'ai' | 'self'
  const saveAvatar = (side, val) => {
    if (side === 'ai') { setAvatarAi(val); try { localStorage.setItem('chat_avatar_ai', val) } catch {} }
    else { setAvatarSelf(val); try { localStorage.setItem('chat_avatar_self', val) } catch {} }
    setAvatarPick(null)
  }
  // 应用启动埋点（本地统计）
  useEffect(() => { stats.launch() }, [])
  // 启动即注册 Service Worker，让 Web Push 能送达（不弹权限请求，仅注册）
  useEffect(() => {
    if (pushSupported()) {
      registerServiceWorker().catch(() => {})
    }
  }, [])
  // 时间光：让"小家跟着一天呼吸"在全局生效（LAIR 也跟着变光线，不只聊天页）
  useEffect(() => {
    const applyTime = () => {
      const h = new Date().getHours()
      const t = h < 5 ? 'dawn' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'night'
      document.body.setAttribute('data-time', t)
    }
    applyTime()
    const iv = setInterval(applyTime, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  // 环境层初始化：读 localStorage 应用壁纸变量（壁纸设置组件也会写，这里是首屏就生效）
  useEffect(() => {
    try {
      const root = document.documentElement
      const wp = localStorage.getItem('home-wallpaper') || ''
      const op = localStorage.getItem('wallpaper-opacity') || '0.34'
      const dk = localStorage.getItem('wallpaper-darken') || '0.12'
      root.style.setProperty('--wallpaper', wp ? `url("${wp}")` : 'none')
      root.style.setProperty('--wallpaper-opacity', op)
      root.style.setProperty('--wallpaper-darken', dk)
    } catch (_) {}
  }, [])
  // 天气氛围层：真实天气给房间染上呼吸感（很淡，叠在壁纸之上；失败则无染色）
  // 同时存 state 供 SplashScreen 使用
  const [weather, setWeather] = useState(null)
  useEffect(() => {
    fetch(`${API_BASE}/api/home/weather`).then(r => r.json()).then(d => {
      if (d && d.ok && d.weather) {
        setWeather(d.weather)
        const sky = d.weather.environment?.sky || d.weather.sky
        const tint = WEATHER_TINT[sky] || 'rgba(180,180,185,0.08)'
        document.documentElement.style.setProperty('--weather-tint', tint)
      }
    }).catch(() => {})
  }, [])
  const [currentChat, setCurrentChat] = useState(() => {
    try { return JSON.parse(localStorage.getItem('current_chat') || 'null') } catch { return null }
  })
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  // 导航请求：便利贴 ✍ → 切到 LIFE 并打开日记室今日视图
  const [navReq, setNavReq] = useState(null)
  const handleWriteDiary = () => { setActiveTab('life'); setNavReq('diary-today') }

  const handleOpenChat = (chat) => {
    setCurrentChat(chat)
    try { localStorage.setItem('current_chat', JSON.stringify(chat)) } catch (_) {}
  }

  const handleBack = () => {
    setCurrentChat(null)
    try { localStorage.removeItem('current_chat') } catch (_) {}
    setRefreshTrigger(t => t + 1)
  }

  // 默认「我们的窗口」：首次启动把已有会话认领为默认（不可删除），没有才新建
  useEffect(() => {
    (async () => {
      try {
        const homeId = localStorage.getItem('home_conv_id')
        const list = await fetchConversations()
        const arr = Array.isArray(list) ? list : []
        const exists = homeId && arr.some(c => c.id === homeId)
        if (!exists) {
          let home = arr[0]
          if (!home) { const { id } = await createConversation('钟泽 💛'); stats.newConversation(); home = { id, title: '钟泽 💛' } }
          localStorage.setItem('home_conv_id', home.id)
          if (!currentChat) {
            const c = { id: home.id, title: home.title || '钟泽' }
            setCurrentChat(c)
            try { localStorage.setItem('current_chat', JSON.stringify(c)) } catch (_) {}
          }
        }
      } catch (_) {}
    })()
  }, [])

  // 列表里改了标题，同步回当前打开的会话（头部标题跟着变）
  const handleTitleChange = (convId, title) => {
    if (currentChat?.id === convId) {
      const upd = { ...currentChat, title: title || currentChat.title }
      setCurrentChat(upd)
      try { localStorage.setItem('current_chat', JSON.stringify(upd)) } catch (_) {}
    }
  }

  return (
    <div className="page-wrap">
      {showSplash && (
        <SplashScreen
          weather={weather}
          onDone={() => setShowSplash(false)}
        />
      )}
      {/* 环境层（澄 HomeRoom v2）：壁纸 + 暖光 + 暗角——小家不是页面，是房间 */}
      <div className="wallpaper-layer" />
      <div className="weather-aura" />
      <div style={{ display: activeTab === 'lair' ? 'block' : 'none' }}><LairPage avatarSelf={avatarSelf} avatarAi={avatarAi} /></div>
      <div style={{ display: activeTab === 'chat' ? 'block' : 'none' }}>
        {currentChat
          ? <ChatDetailPage chatInfo={currentChat} onBack={handleBack} avatarSelf={avatarSelf} avatarAi={avatarAi} avatarPick={avatarPick} setAvatarPick={setAvatarPick}/>
          : <ChatListPage onOpenChat={handleOpenChat} refreshTrigger={refreshTrigger} onTitleChange={handleTitleChange}/>
        }
      </div>
      <div style={{ display: activeTab === 'life' ? 'block' : 'none' }}><LifePage navReq={navReq} onNavConsumed={() => setNavReq(null)} avatarSelf={avatarSelf} avatarAi={avatarAi} onPickAvatar={setAvatarPick} /></div>
      <TabNav activeTab={activeTab} onChangeTab={setActiveTab}/>
      {/* 头像选择器（点击头像唤起，全局浮层）—— 聊天页 / LAIR / 布置小家共用同一份数据 */}
      {avatarPick && (
        <div className="msg-action-menu-overlay" onClick={() => setAvatarPick(null)}>
          <div className="msg-action-menu avatar-picker-menu" style={{ '--menu-x': '50vw', '--menu-y': '50%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginBottom: 8, textAlign: 'center' }}>
              {avatarPick === 'ai' ? '换 AI 头像' : '换我的头像'}
            </div>
            <div className="avatar-emoji-grid">
              {['泽', '🐱', '🌸', '⭐', '🌙', '🍵', '🎨', '💫'].map(emoji => (
                <div key={emoji} className="avatar-emoji" onClick={() => saveAvatar(avatarPick, emoji)}>{emoji}</div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--color-border-warm)', margin: '8px 0 4px' }} />
            <div className="msg-action-item" onClick={() => {
              const url = window.prompt('粘贴图片 URL：')
              if (url) saveAvatar(avatarPick, url.trim())
            }} style={{ justifyContent: 'center', fontSize: 12 }}>
              📷 图片链接…
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
