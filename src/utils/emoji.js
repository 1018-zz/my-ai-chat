// 把容器内的 Unicode emoji 替换为 Twemoji 彩色 SVG
// —— 跨平台外观统一（对标微信），并彻底消除 ❓ 豆腐块（系统缺字形时也能显示）
// emoji 脚本与图集均自托管在 /emoji/（见 index.html + public/emoji/），不依赖任何外部 CDN。

const TWEMOJI_BASE = '/emoji/svg/' // 本地自托管的 svg 图集目录（结尾含 /）

export function applyTwemoji(root) {
  if (!root || !window.twemoji) return
  window.twemoji.parse(root, {
    folder: '', // 图集直接在 base 根目录，无子目录
    ext: '.svg',
    base: TWEMOJI_BASE,
    callback: (icon, opts) => {
      // 代码块 / 行内代码内的 emoji 保持纯文本，不被替换成图片
      const node = opts && opts.node
      const parent = node && node.parentNode
      if (parent && parent.closest && parent.closest('code, pre')) return false
      const sep = opts.folder ? opts.folder + '/' : ''
      return `${opts.base}${sep}${icon}${opts.ext}`
    },
  })
}
