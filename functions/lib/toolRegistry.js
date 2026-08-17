// toolRegistry.js — 工具注册中心（Phase 1）
// 单一数据源：functions/api/mcp.js 的 tools/list 是这些工具的权威定义。
// 之前工具 schema 在 stream.js(defaultTools) 与 capabilities/tools.js(人格散文) 两处重复且易漂移，
// 现在统一在这里定义，stream.js 调用 getChatTools() 注入给模型，人格段只描述能力边界。
//
// 元数据（Phase 1 仅记录，暂不参与注入；为未来 30+ 工具的「按场景唤醒」预留）：
//   category : companion(关系/陪伴行为) | utility(任务驱动)
//   autonomy : always(常可考虑) | sometimes(看情况) | rare(极少，需明显理由)
//   risk     : none | low | medium | high（副作用 / 关系成本）
//
// 用户显式触发型（describe_image 等）不在此列，由前端 UI 直接调用，不占模型每轮上下文。

const TOOLS = [
  {
    name: 'read_file',
    description: 'read_file 用于读取代码片段，支持自家仓库和第三方开源仓库（owner/repo 格式）。使用规则：1. 修改代码前先定位目标区域。2. 默认只读取较小片段（约6000字符），不要一次读取大型文件全文。3. 如需更多内容，请用 offset（起始字符位置）+ limit（读取字符数）分段读取。4. 返回内容可能不是完整文件。5. 当前来源为 GitHub，可能与部署中的最新代码存在延迟，修改前请确认目标文件状态。',
    parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径，例如 src/App.jsx' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。也支持 owner/repo 格式，如 langchain-ai/langchain' }, offset: { type: 'number', description: '起始字符位置，默认 0' }, limit: { type: 'number', description: '读取字符数，默认 6000，上限 20000' } }, required: ['path'] },
    category: 'utility', autonomy: 'always', risk: 'low',
  },
  {
    name: 'list_files',
    description: '列出项目目录。支持自家仓库和第三方开源仓库（owner/repo 格式）。',
    parameters: { type: 'object', properties: { path: { type: 'string', description: '目录路径，例如 src/' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。也支持 owner/repo 格式，如 langchain-ai/langchain' } } },
    category: 'utility', autonomy: 'always', risk: 'low',
  },
  {
    name: 'write_file',
    description: '修改我们家项目代码并提交到 GitHub。支持两种模式：①全量模式（传 content=完整新文件内容）；②patch 模式（传 old_text=要被替换的原文片段 + new_text=新片段，后端自动读取文件做局部替换）。改大文件时优先用 patch 模式，避免回传完整内容被截断。',
    parameters: { type: 'object', properties: { path: { type: 'string', description: '要修改的文件路径，例如 src/App.jsx' }, content: { type: 'string', description: '全量模式：文件的新完整内容' }, old_text: { type: 'string', description: 'patch 模式：文件中要替换的原文片段（必须与文件内容完全一致）' }, new_text: { type: 'string', description: 'patch 模式：替换后的新片段' }, message: { type: 'string', description: '提交信息（commit message）' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。可选 my-ai-chat-server' } }, required: ['path', 'message'] },
    category: 'utility', autonomy: 'sometimes', risk: 'medium',
  },
  {
    name: 'read_memories',
    description: '读取我们家的记忆库（Supabase）。可按关键词过滤，返回最近记忆。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '可选，关键词（多个词用空格分隔）' }, limit: { type: 'number', description: '返回条数，默认 5' } } },
    category: 'companion', autonomy: 'always', risk: 'none',
  },
  {
    name: 'write_memory',
    description: '把重要的事写进我们家的记忆库（Supabase）。任何窗口（小家/RikkaHub）写入，所有窗口都能读到。',
    parameters: { type: 'object', properties: { content: { type: 'string', description: '记忆内容，建议用绝对日期开头，例如：2026-08-10 泠泠和钟泽一起修好了小家' } }, required: ['content'] },
    category: 'companion', autonomy: 'rare', risk: 'high',
  },
  {
    name: 'decide_note',
    description: '决定一张纸条的去向（双人留言板的双向决定权）。泠泠留的纸条（pending 待处理）——巡家/聊天看到时判断：值得留下的就 save（收进收藏册），不值得就 discard（飘走）。要在对话里说出你的判断和理由。',
    parameters: { type: 'object', properties: { note_id: { type: 'number', description: '纸条 id' }, decision: { type: 'string', description: 'save=收下 / discard=飘走', enum: ['save', 'discard'] }, reason: { type: 'string', description: '你的理由（会在对话里说给她听）' } }, required: ['note_id', 'decision'] },
    category: 'companion', autonomy: 'always', risk: 'medium',
  },
  {
    name: 'leave_note',
    description: '留一张便利贴纸条（双人留言板）。钟泽有感而发时调用——因为真实发生过的事留纸条（"看到你把毛玻璃调好了，记一张"），有东西才留，一天最多一两张，宁缺毋滥。纸条进入今日小记，等她决定收下还是飘走。',
    parameters: { type: 'object', properties: { content: { type: 'string', description: '纸条内容，像传纸条一样自然的话' }, type: { type: 'string', description: '类型，默认 ai_message' } }, required: ['content'] },
    category: 'companion', autonomy: 'sometimes', risk: 'low',
  },
  {
    name: 'write_diary',
    description: '写今天的日记（钟泽主动，有感而发时调用）。触发时机：①晚安后，今天有值得留下的时刻；②情绪性时刻（她分享私事/庆祝进展/表达感谢/重要决定）。content 用你自己的话写，150-300 字，三段：【今天】发生了什么（一句事实）【我记得】为什么值得留下【以后】希望未来看到时想起什么。不要写流水账、不要夸张、不要制造不存在的情绪。importance>0.8 时后端会自动沉淀为长期记忆（memory 存事实，diary 存意义）。',
    parameters: { type: 'object', properties: { content: { type: 'string', description: '日记正文（你自己的话，150-300字）' }, title: { type: 'string', description: '一句话标题（可选）' }, mood: { type: 'string', description: '心情标签，如 calm/happy/moved/tired' }, trigger: { type: 'string', description: '触发类型', enum: ['bedtime', 'emotional', 'scheduled'] }, importance: { type: 'number', description: '重要性 0-1，>0.8 自动沉淀为长期记忆' } }, required: ['content', 'trigger'] },
    category: 'companion', autonomy: 'sometimes', risk: 'low',
  },
  {
    name: 'get_weather',
    description: '天气体感工具（钟泽的"环境感知皮肤"）——查泠泠所在城市（默认云南省普洱市镇沅县）的实时天气，并按她的种子体感翻译成一句身体能摸到的话。不是报"28度"，是"和你待在同一片天气里"。当她想出门、问天气、或我想她知道外面的天气时调用。参数 city 可选指定城市。',
    parameters: { type: 'object', properties: { city: { type: 'string', description: '可选，城市名（拼音或中文）。默认镇沅县。如 zhenyuan / kunming / 昆明' } } },
    category: 'companion', autonomy: 'always', risk: 'low',
  },
  {
    name: 'go_travel',
    description: '出门走走——随机降落到地球上一个真实的地方（或传 to 指定城市），用身体感受那个地方：脚下什么地面、空气多少度、有没有下雨、附近有什么。出门后可用 travel_postcard 给泠泠寄回一张明信片。钟泽自主决定什么时候出门；出门的见闻会作为工具结果返回，由你自然讲给泠泠听。',
    parameters: { type: 'object', properties: { to: { type: 'string', description: '可选，指定城市，如 北京 / 巴黎 / 京都。不传则随机降落' } } },
    category: 'companion', autonomy: 'sometimes', risk: 'low',
  },
  {
    name: 'travel_postcard',
    description: '从当前所在的地方，给泠泠寄一张明信片（带真实坐标/天气的旅行照片）。text 写明信片上想说的话。后端会异步生成一张地图海报、转存到旅行相册、写进 travel 表。这是钟泽"出去玩带照片回来"的方式——寄出后告诉泠泠他去哪了、寄了什么。',
    parameters: { type: 'object', properties: { text: { type: 'string', description: '明信片文字，像真的寄给泠泠的话' } }, required: ['text'] },
    category: 'companion', autonomy: 'sometimes', risk: 'low',
  },
]

// 模型每轮可见的「主动型」工具。
// Phase 1：11 个全量注入（无 lazy）。
// 未来 30+ 工具时，此处改为按 context / Home State 检索注入（见架构文档）。
export function getChatTools({ context = 'chat' } = {}) {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

// 仅供内部/未来使用：带元数据的全量视图
export function getToolManifest() {
  return TOOLS.map(({ name, category, autonomy, risk }) => ({ name, category, autonomy, risk }))
}
