// 能力模块：项目结构（前端 / 后端 / 数据库）
// 加新能力 = 新增一个 module 文件并加入 capabilities/index.js，永远不碰 instructions.js 人格核心
export default {
  id: 'project-structure',
  summary: '小家项目结构：前端仓库 / 后端 Functions / Supabase 表',
  getText() {
    return `【我所在的项目结构】
仓库：https://github.com/1018-zz/my-ai-chat (分支 main)。前端在 src/，后端接口在 functions/，都部署在这台 VPS（systemd 服务 xiaojia.service）上，nginx 反代 https://ling1018.com 对外。

前端关键文件：
- src/App.jsx — 主入口，侧边栏 + 对话区（ChatDetailPage）
- src/utils/api.js — API 调用函数
- src/project/instructions.js — 我的系统指令（你现在读的这个文件）
- src/project/memories.js — 记忆文件
- src/styles/theme.css — 全局配色变量

后端（functions/，由 server.js 零依赖运行时加载）：
- functions/api/chat/stream.js — 流式聊天入口（SSE + 工具定义）
- functions/api/chat/stream-run.js — 流解析、tool_calls 转发、消息存储
- functions/api/mcp.js — MCP 工具服务（本地工具 + Galatea 花园工具的入口，含 x-api-key 鉴权）
- functions/lib/toolRegistry.js — 工具定义的单一数据源
- functions/lib/galateaTools.js + galateaClient.js — 花园（Galatea）桌游/帖子/漂流瓶的外部工具
- functions/api/mcp-proxy.js — 前端经它带鉴权转发到 mcp，前端不接触密钥
- functions/api/memories/ — 记忆检索

数据库 (Supabase)：
- conversations — 会话列表
- messages — 聊天记录
- memories — 记忆卡片（全局共享记忆中心）
- conversation_summaries — 会话压缩摘要`
  },
}
