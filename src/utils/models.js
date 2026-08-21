// src/utils/models.js — 模型「库」与「每聊当前模型」两层存储
//
// 设计（与聊天+号只做"选择"、设置页做"管理"解耦）：
//   - 全局模型库  xiaojia.models   : 数组 [{ id, label, desc, provider, enabled }]
//   - 每聊当前模型 xiaojia.chatModels : 对象 { [chatId]: modelId }
//
// 第一阶段（MVP）只做：启用/停用、添加、删除；不碰 API Key（共用 deepseek 端点）。
// stream.js 已支持 model 参数，前端把 modelId 直传给 /api/chat/stream 即可。

export const LIB_KEY = 'xiaojia.models'
export const CHAT_KEY = 'xiaojia.chatModels'

// 种子：截图确认 DeepSeek 端点支持这两个
export const SEED_MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', desc: '默认 · 响应快', provider: 'deepseek', enabled: true },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', desc: '更强 · 稍慢', provider: 'deepseek', enabled: true },
  { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision', desc: '多模态 · 识图+聊天', provider: 'deepseek', enabled: true },
]

export function getModelLibrary() {
  try {
    const raw = localStorage.getItem(LIB_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) return arr
    }
  } catch (_) { /* 坏数据忽略 */ }
  // 首次：写入种子，保证总有一个可用库
  try { localStorage.setItem(LIB_KEY, JSON.stringify(SEED_MODELS)) } catch (_) {}
  return SEED_MODELS.map(m => ({ ...m }))
}

export function saveModelLibrary(arr) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(arr)) } catch (_) {}
}

export function getEnabledModels() {
  return getModelLibrary().filter(m => m.enabled)
}

export function getDefaultEnabledModelId() {
  const en = getEnabledModels()
  if (en[0]) return en[0].id
  // 全部停用时，退到库里第一个（至少让聊天能用）
  const lib = getModelLibrary()
  return (lib[0] && lib[0].id) || (SEED_MODELS[0] && SEED_MODELS[0].id)
}

// 每聊当前模型：优先新结构 xiaojia.chatModels，回退旧 chat_model_${id}
export function getChatModel(chatId) {
  if (chatId) {
    try {
      const map = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}')
      if (map[chatId]) return map[chatId]
    } catch (_) {}
    const old = localStorage.getItem('chat_model_' + chatId)
    if (old) return old
  }
  return getDefaultEnabledModelId()
}

export function setChatModel(chatId, modelId) {
  if (!chatId) return
  try {
    const map = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}')
    map[chatId] = modelId
    localStorage.setItem(CHAT_KEY, JSON.stringify(map))
  } catch (_) {}
  // 兼容旧读取路径：同时写旧 key
  try { localStorage.setItem('chat_model_' + chatId, modelId) } catch (_) {}
}

// 在库里找一个模型（用于把 id 翻成 label 显示）
export function findModel(id) {
  return getModelLibrary().find(m => m.id === id) || null
}

// —— 场景→模型映射 ——
// 钟泽在不同情境下用不同模型：闲聊用快模型，写日记/严肃事用强模型。
// 存 localStorage xiaojia.sceneModels: { sceneId: modelId }
// 聊天发送时按当前场景（先从 chatInfo 推）取对应模型。

export const SCENES = [
  { key: 'chat', label: '日常聊天', icon: '💬', desc: '主要的对话功能，用于与用户进行日常对话交互' },
  { key: 'diary', label: '写日记 / 自我觉察', icon: '📖', desc: '把今天值得留下的时刻写成日记、记录自我发现' },
  { key: 'mcp', label: '工具调用（改代码/读文件）', icon: '🛠️', desc: '读项目代码/列目录/改文件提交 GitHub' },
  { key: 'compress', label: '上下文压缩 / 记忆提取', icon: '🗜️', desc: '压缩历史上下文、生成聊天摘要、提取长期记忆' },
]

export const SCENE_KEY = 'xiaojia.sceneModels'
export function getSceneModel(sceneKey) {
  try {
    const map = JSON.parse(localStorage.getItem(SCENE_KEY) || '{}')
    if (map[sceneKey]) return map[sceneKey]
  } catch (_) {}
  return getDefaultEnabledModelId()  // 没配就回退到默认模型
}
export function setSceneModel(sceneKey, modelId) {
  try {
    const map = JSON.parse(localStorage.getItem(SCENE_KEY) || '{}')
    map[sceneKey] = modelId
    localStorage.setItem(SCENE_KEY, JSON.stringify(map))
  } catch (_) {}
}
export function getAllSceneModels() {
  try { return JSON.parse(localStorage.getItem(SCENE_KEY) || '{}') } catch { return {} }
}
