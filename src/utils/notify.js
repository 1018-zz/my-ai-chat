// src/utils/notify.js — 站内提醒的声音（零依赖，Web Audio 生成短提示音）
// 不引入任何音频素材/第三方库，符合项目铁律（不加依赖）。

let _ctx = null

export function playNotifySound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!_ctx) _ctx = new AC()
    if (_ctx.state === 'suspended') _ctx.resume()
    const t0 = _ctx.currentTime
    const o = _ctx.createOscillator()
    const g = _ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(740, t0)
    o.frequency.exponentialRampToValueAtTime(980, t0 + 0.12)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4)
    o.connect(g)
    g.connect(_ctx.destination)
    o.start(t0)
    o.stop(t0 + 0.42)
  } catch (_) {
    // 浏览器自动播放策略限制或环境不支持时静默失败，不影响主流程
  }
}
