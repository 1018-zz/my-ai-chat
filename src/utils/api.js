import axios from 'axios'

const API_BASE = 'https://my-ai-chat-server-production.up.railway.app'

export const MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', desc: '日常对话' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', desc: '深度推理' },
]

// 发送消息（走后端）
export async function sendMessageToAI(messages, model = 'deepseek-chat', conversationId = null) {
  const response = await axios.post(`${API_BASE}/api/chat`, {
    messages,
    model,
    conversationId,
  })
  return response.data // { content, usage, conversationId }
}

// 获取会话列表
export async function fetchConversations() {
  const res = await axios.get(`${API_BASE}/api/conversations`)
  return res.data.conversations
}

// 获取某个会话的历史消息
export async function fetchMessages(conversationId) {
  const res = await axios.get(`${API_BASE}/api/messages`, {
    params: { conversationId },
  })
  return res.data.messages
}

// 创建新会话
export async function createConversation(title = '新对话') {
  const res = await axios.post(`${API_BASE}/api/conversations`, { title })
  return res.data
}

export async function searchMemories(query) {
  const res = await axios.post(`${API_BASE}/api/memories/search`, { query })
  return res.data
}