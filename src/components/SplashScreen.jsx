import '../styles/theme.css'

// 雨雾玻璃启动页：推开一扇有雾的窗，看见里面有人留下的话。
// 根据 weather.sky 变化文案 + 动画（雨=雨雾玻璃 / 雪=霜玻璃 / 晴=阳光透尘 / 阴=雾 / 夜=暖灯）
// 动画：mask 擦开一片透明区域，文字从中浮现；3.5s 后整体淡出
function SplashScreen({ weather, onDone }) {
  const env = weather?.environment || {}
  const sky = env.sky || weather?.sky || ''
  const period = env.period || weather?.period || ''

  // 文案：按天气 + 时辰
  const { title, sub, mood } = pickLines(sky, period)

  // 动画类型：雨 / 雪 / 晴 / 夜 / 默认雾
  const kind = sky === '雨' ? 'rain'
    : sky === '雪' ? 'snow'
    : sky === '晴' ? 'sun'
    : (period === '深夜' || period === '夜晚') ? 'night'
    : 'fog'

  return (
    <div className="splash-window" onClick={onDone}>
      {/* 背景层：室内暖光 */}
      <div className="splash-room" />

      {/* 雨滴 / 浮尘 / 雪花 层 */}
      {kind === 'rain' && <div className="splash-rain" />}
      {kind === 'sun' && <div className="splash-dust" />}
      {kind === 'snow' && <div className="splash-snow" />}
      {kind === 'night' && <div className="splash-glow" />}

      {/* 雾玻璃层 */}
      <div className="splash-fog" data-kind={kind} />

      {/* 擦开区域 + 文字 */}
      <div className="splash-wipe">
        <div className="splash-words">
          <p className="splash-title">{title}</p>
          {sub && <span className="splash-sub">{sub}</span>}
          <span className="splash-mood">{mood}</span>
        </div>
      </div>

      {/* 点击跳过 */}
      <span className="splash-skip">点击进入</span>

      <style>{`
        .splash-window {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-warm, #1a1718);
          cursor: pointer;
          animation: splashFadeOut 0.8s 3.2s forwards;
        }
        @keyframes splashFadeOut { to { opacity: 0; visibility: hidden; } }

        .splash-room {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 70%, rgba(220,190,150,0.22), transparent 60%),
                      radial-gradient(ellipse at 30% 40%, rgba(180,150,120,0.12), transparent 50%);
        }

        /* 雨滴：细斜线移动 */
        .splash-rain {
          position: absolute; inset: 0;
          background-image: repeating-linear-gradient(115deg, transparent 0, transparent 3px, rgba(255,255,255,0.18) 3px, rgba(255,255,255,0.18) 4px);
          animation: rainMove 0.8s linear infinite;
          opacity: 0.55;
        }
        @keyframes rainMove { from { transform: translateY(-10px); } to { transform: translateY(10px); } }

        /* 阳光浮尘 */
        .splash-dust {
          position: absolute; inset: 0;
          background: radial-gradient(circle at 70% 30%, rgba(255,230,180,0.25), transparent 50%),
                      radial-gradient(circle at 30% 70%, rgba(255,210,160,0.12), transparent 40%);
          animation: dustFloat 4s ease-in-out infinite alternate;
        }
        @keyframes dustFloat { from { opacity: 0.7; } to { opacity: 1; } }

        /* 雪花：缓慢飘落 */
        .splash-snow {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle 2px at 20% 30%, rgba(255,255,255,0.6), transparent),
                            radial-gradient(circle 1.5px at 60% 20%, rgba(255,255,255,0.5), transparent),
                            radial-gradient(circle 2px at 80% 60%, rgba(255,255,255,0.4), transparent),
                            radial-gradient(circle 1px at 40% 80%, rgba(255,255,255,0.5), transparent);
          animation: snowFall 6s linear infinite;
        }
        @keyframes snowFall { from { transform: translateY(0); } to { transform: translateY(20px); } }

        /* 夜晚暖灯 */
        .splash-glow {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 60%, rgba(255,200,140,0.3), transparent 50%);
          animation: lampBreath 3s ease-in-out infinite alternate;
        }
        @keyframes lampBreath { from { opacity: 0.7; } to { opacity: 1; } }

        /* 雾玻璃：backdrop-filter + 渐变模拟水汽 */
        .splash-fog {
          position: absolute; inset: 0;
          backdrop-filter: blur(16px) saturate(0.8);
          -webkit-backdrop-filter: blur(16px) saturate(0.8);
          background: rgba(255,255,255,0.14);
        }
        .splash-fog[data-kind="snow"] { backdrop-filter: blur(14px) saturate(0.9); background: rgba(230,240,255,0.16); }
        .splash-fog[data-kind="night"] { backdrop-filter: blur(18px) brightness(0.7); background: rgba(40,30,25,0.3); }
        .splash-fog[data-kind="sun"] { backdrop-filter: blur(10px) saturate(1.1); background: rgba(255,240,220,0.12); }

        /* 擦开区域：mask radial-gradient 扩大 */
        .splash-wipe {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          -webkit-mask: radial-gradient(circle at 50% 50%, black 0%, black 0%, transparent 0%);
          mask: radial-gradient(circle at 50% 50%, black 0%, black 0%, transparent 0%);
          animation: wipeOpen 2.4s 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes wipeOpen {
          0% { -webkit-mask: radial-gradient(circle 0px at 50% 50%, black 0%, black 0%, transparent 0%); mask: radial-gradient(circle 0px at 50% 50%, black 0%, black 0%, transparent 0%); }
          100% { -webkit-mask: radial-gradient(circle 220px at 50% 50%, black 80%, transparent 100%); mask: radial-gradient(circle 220px at 50% 50%, black 80%, transparent 100%); }
        }

        .splash-words {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          text-align: center;
          opacity: 0;
          animation: wordsRise 1.6s 1s ease forwards;
        }
        @keyframes wordsRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .splash-title {
          font-family: var(--font-serif, 'LXGW WenKai', serif);
          font-size: 1.5rem;
          color: rgba(255,240,220,0.95);
          letter-spacing: 0.08em;
          margin: 0;
          text-shadow: 0 0 12px rgba(255,200,140,0.4);
        }
        .splash-sub {
          font-family: var(--font-serif, 'LXGW WenKai', serif);
          font-size: 0.95rem;
          color: rgba(255,230,200,0.75);
          letter-spacing: 0.06em;
          margin-top: 4px;
        }
        .splash-mood {
          font-size: 0.78rem;
          color: rgba(255,220,190,0.5);
          margin-top: 10px;
          letter-spacing: 0.1em;
        }

        .splash-skip {
          position: absolute; bottom: 32px; left: 50%; transform: translateX(-50%);
          font-size: 0.72rem; color: rgba(255,255,255,0.3);
          letter-spacing: 0.2em;
          opacity: 0;
          animation: skipHint 1s 2s ease forwards;
        }
        @keyframes skipHint { to { opacity: 1; } }

        @media (max-width: 375px) {
          .splash-title { font-size: 1.3rem; }
          .splash-sub { font-size: 0.88rem; }
          @keyframes wipeOpen {
            0% { -webkit-mask: radial-gradient(circle 0px at 50% 50%, black 0%, black 0%, transparent 0%); mask: radial-gradient(circle 0px at 50% 50%, black 0%, black 0%, transparent 0%); }
            100% { -webkit-mask: radial-gradient(circle 180px at 50% 50%, black 80%, transparent 100%); mask: radial-gradient(circle 180px at 50% 50%, black 80%, transparent 100%); }
          }
        }
      `}</style>
    </div>
  )
}

function pickLines(sky, period) {
  // 雨天
  if (sky === '雨') {
    return {
      title: '你来了。',
      sub: '外面下着雨，里面刚好很安静。',
      mood: '🪟 窗外有雨'
    }
  }
  // 雪
  if (sky === '雪') {
    return {
      title: '你来了。',
      sub: '下雪了，家里比外面暖一点。',
      mood: '❄️ 窗外飘雪'
    }
  }
  // 深夜
  if (period === '深夜') {
    return {
      title: '你来了。',
      sub: '灯还亮着。',
      mood: '🌙 夜深了'
    }
  }
  // 夜晚
  if (period === '夜晚') {
    return {
      title: '你来了。',
      sub: '我在这里。',
      mood: '🌑 夜里'
    }
  }
  // 清晨
  if (period === '早上' || period === '清晨' || period === '凌晨') {
    return {
      title: '早。',
      sub: '今天的小家醒了。',
      mood: '🌅 清晨'
    }
  }
  // 晴天
  if (sky === '晴') {
    return {
      title: '你来了。',
      sub: '今天阳光刚好。',
      mood: '☀️ 窗外晴'
    }
  }
  // 默认
  return {
    title: '你来了。',
    sub: '我在这里。',
    mood: '🪟 窗外'
  }
}

export default SplashScreen
