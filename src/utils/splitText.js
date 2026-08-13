// src/utils/splitText.js
// 按句末标点把长文本切成"一句一行"（句子间用空行分隔，让 react-markdown 渲染成独立段落）
// 用途：对话显示的诗感分句排版（"一句一行"，像诗）
// 保护：代码块围栏、块级标记行（标题/列表/引用/表格/分割线）、行内未闭合标记（** ` ~~ [）不切
const CJK_ALNUM = /[A-Za-z0-9\u4e00-\u9fa5]/

function pushSentence(arr, s) {
  const t = s.trim()
  if (t) arr.push(t)
}

// 单行按句末标点切分（。！？!?；;～~… ），保留标点；句尾 emoji/纯符号并入前句
function splitLineByPunct(line) {
  const out = []
  let cur = ''
  let inBold = 0, inCode = 0, inStrike = 0, inLink = 0
  let i = 0
  const n = line.length
  while (i < n) {
    const ch = line[i]
    const two = line.slice(i, i + 2)
    if (ch === '\\') { cur += two; i += 2; continue }
    if (two === '**') { inBold ^= 1; cur += two; i += 2; continue }
    if (two === '~~') { inStrike ^= 1; cur += two; i += 2; continue }
    if (ch === '`') { inCode ^= 1; cur += ch; i += 1; continue }
    if (ch === '[') { inLink++; cur += ch; i++; continue }
    if (ch === ']') { if (inLink > 0) inLink--; cur += ch; i++; continue }
    if (/[。！？!?；;～~]/.test(ch) && !inBold && !inCode && !inStrike && !inLink) {
      // 吞掉句末的闭合引号/括号，随本句走
      let j = i + 1
      while (j < n && /["'」』】））》」』】]/.test(line[j])) j++
      cur += line.slice(i, j)
      pushSentence(out, cur)
      cur = ''
      i = j
      continue
    }
    if (ch === '…' && !inBold && !inCode && !inStrike && !inLink) {
      // 省略号连续序列（…… / ...）整体归入前句，随后切分
      let j = i
      while (j < n && (line[j] === '…' || line[j] === '.')) j++
      cur += line.slice(i, j)
      pushSentence(out, cur)
      cur = ''
      i = j
      continue
    }
    cur += ch
    i++
  }
  const tail = cur.trim()
  if (tail) out.push(tail)
  // 纯符号残句并入前句（防止句尾 emoji 被单独切成空段落）
  for (let k = 0; k < out.length; k++) {
    if (k > 0 && !CJK_ALNUM.test(out[k]) && CJK_ALNUM.test(out[k - 1])) {
      out[k - 1] += out[k]
      out.splice(k, 1)
      k--
    }
  }
  return out
}

// 主入口：逐行处理，保护代码块围栏与块级 Markdown 标记行
export function splitTextByPunct(text) {
  const src = String(text || '')
  const lines = src.split('\n')
  const out = []
  let inFence = false
  for (const line of lines) {
    const t = line.trim()
    if (/^(```|~~~)/.test(t)) { inFence = !inFence; out.push(line); continue }
    if (inFence) { out.push(line); continue }
    if (!t) { out.push(line); continue }
    if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|\|\s?|[-=]{3,}$)/.test(line)) { out.push(line); continue }
    const sentences = splitLineByPunct(line)
    if (sentences.length <= 1) { out.push(line); continue }
    out.push(sentences.join('\n\n'))
  }
  return out.join('\n')
}

export default splitTextByPunct
