# My AI Architecture Rules v1

> 本文档为 my-ai-chat 项目的**长期架构铁则**，优先级高于"增量优化"等战术约束。
> 阶段：架构固化（2026-08-23）。本阶段只文档化与边界分析，**不修改任何代码**。

---

## Rule 1: Core ≠ Server

AI 核心能力不能依赖 VPS 才能存在。

**Core 包含：**
- Identity（身份）
- Personality（人格）
- Memory（记忆）
- Conversation（对话）
- Decision（决策）

**Server / VPS 只是扩展能力：**
- 在线服务
- 定时任务
- 外部资源
- 远程工具

**目标：** 没有 VPS 时，AI 仍然可以运行（知道自己是谁、记得过去、可以聊天、可以调用本地工具）。

---

## Rule 2: Local First, Cloud Sync

**长期目标：** 本地数据是主人。云端是同步 / 备份 / 跨设备支持。

```
Local Storage
      |
      |   Sync Layer
      |
      v
Cloud Backup
```

**注意：** 当前**不要修改 `memories.js`**。此处只记录目标方向。

---

## Rule 3: MCP Capability Layer

MCP 不应该绑定运行地点。未来结构：

```
MCP
├── Local Runtime      （文件 / 本地代码 / 本地数据库 / 私人资料）
├── Remote Runtime     （天气 / 搜索 / 公网服务 / 定时任务）
└── Hybrid Runtime     （同步 / 长期任务 / 知识库）
```

**当前只记录设计，不实现。**

---

## 附录 A：现状核对（2026-08-23，仅记录，不改代码）

### A.1 Memory 调用链现状
```
UI 组件
  ↓
src/project/memories.js  (Memory Service)
  ├─ 主路径: fetch(`${API_BASE}/api/memories/project`)  →  VPS 后端 → Supabase
  └─ 回退:   localStorage（离线时）
```
- **直接依赖 VPS 的点**：记忆主存走 `前端 → /api/memories（VPS 后端，后端连 Supabase）`，**不是前端直连 Supabase**。
- 因此"断网也记得过去"在当前不成立：主路径依赖 VPS 后端在线。
- 未来 `MemoryService` 抽象层位置：在 `memories.js` 与存储之间插入，优先读本地（IndexedDB/本地文件），异步同步到云端。

### A.2 MCP 调用链现状
```
前端 (src/utils/mcpAuth.js)
  ↓  /api/mcp-proxy  （后端代填 x-api-key）
  ↓  /api/mcp        →  functions/api/mcp.js (tools/list, tools/call)
  ↓  runReadOnly()   →  shell/readonly.js（白名单：status / is-active / logs）
```
- server.js 是零依赖 Node 运行器，扫描 `functions/api/` 自动路由 `/api/*`。
- **wake 不在 MCP 链中**：wake 由 `server.js` 用 `import './wake/engine.js'` 直接拉入**同一 Node 进程**运行（源码独立仓库，运行时同进程），不调用任何 MCP 工具。
- 未来支持 Local MCP 需增加的抽象层：在 mcp client 与"执行器运行时"之间插入 `RuntimeRouter`（按工具声明选择 Local / Remote / Hybrid 执行环境），使本地工具可在本地进程执行，而非全甩 VPS。

### A.3 wake 仓库状态（安全检查）
- 路径 `/opt/xiaojia/wake`，**已有独立 git**（remote = `git@github.com:1018-zz/my-ai-chat-wake.git`）。
- 唯一提交：`f5e56bc wake 引擎初始提交`。
- **风险**：A/B/C 节流优化改了 activation/config/dispatcher/engine/policy/push/rng/routes/stateStore/supabase 共 10 个文件，**均未 commit**，改动游离在工作区。
- **残留**：`*.bak-opt-*` / `*.bak-location` 命名不以 `.bak` 结尾，`.gitignore` 的 `*.bak` 规则拦不住，成为未跟踪文件。
- `state.json`（运行时状态）已被 `.gitignore` 正确忽略。

### A.4 差距矩阵（现状 → 目标）
| 维度 | 现状 | Rule 目标 | 差距 |
|---|---|---|---|
| Core 可移植 | 人格/记忆绑前端 + VPS 后端 | 脱 VPS 可运行 | 大（需本地优先 + 核心解耦） |
| Memory | 主存 = VPS 后端 / Supabase | Local First | 大（需抽象层） |
| MCP | 全在 VPS functions/ 执行 | Local/Remote/Hybrid | 大（无本地执行环境） |
| wake | 源码独立 git，但改动未提交 | 版本安全 | 中（需 commit + 清 .bak） |
| git 安全 | 前端已 commit 未 push；wake 改动未提交 | 双仓均受控 | 中 |

---

## 附录 B：本阶段禁令（架构固化期）
✅ 允许：文档 / 架构分析 / Git 安全检查 / 边界整理
❌ 禁止：大规模重构 / Monorepo / Memory 重写 / MCP 重写 / AI Core 拆迁 / 自动 commit / push
