# My AI Chat（小家聊天）

这是一个基于 **React + Vite** 的个人 AI 聊天网页项目。它包含聊天、记忆、日记、便签、小家氛围、工具调用和本地 Node 运行器等功能。

> 给代码新手的一句话：先把项目跑起来，再慢慢改页面文字、样式和功能。每次改完都运行 `npm run build`，能成功就说明大方向没坏。

## 你需要先安装什么？

1. 安装 Node.js（建议 20 或以上）。
2. 在项目目录安装依赖：

```bash
npm install
```

## 本地开发（推荐新手用）

1. 复制环境变量模板：

```bash
cp .env.example .env
```

2. 打开 `.env`，至少填写：

```bash
DEEPSEEK_API_KEY=你的 DeepSeek Key
SUPABASE_SECRET_KEY=你的 Supabase service role key
SUPABASE_URL=你的 Supabase URL
```

3. 启动前端开发服务器：

```bash
npm run dev
```

4. 如果你要同时使用本仓库自带的 Node 后端运行器，另开一个终端：

```bash
npm run build
npm start
```

然后访问终端里显示的地址，例如 `http://localhost:3000`。

## 常用命令

| 命令 | 作用 | 新手什么时候用 |
| --- | --- | --- |
| `npm install` | 安装依赖 | 第一次下载项目后 |
| `npm run dev` | 启动开发模式 | 改页面、看效果 |
| `npm run build` | 打包并检查能否生产构建 | 每次提交前 |
| `npm run lint` | 代码质量检查 | 每次提交前 |
| `npm start` | 运行打包后的前端和 API | 想模拟部署效果时 |
| `npm run preview` | 预览 Vite 构建结果 | 只看前端静态效果时 |

## 项目目录怎么读？

```text
src/                 前端页面和组件
  App.jsx            主应用入口，大部分页面状态在这里
  components/        可复用界面组件
  utils/             API、时间、模型、通知等工具函数
  project/           项目人格、记忆和能力说明
functions/api/       Cloudflare Pages Functions 风格的 API
functions/lib/       后端 API 共用逻辑
public/              静态资源和 service worker
server.js            本地/VPS 零依赖 Node 运行器
```

## 环境变量说明

完整模板在 `.env.example`。常用项如下：

| 变量 | 必填 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | 聊天、日记生成、压缩等模型调用 |
| `SUPABASE_SECRET_KEY` | 是 | 会话、消息、记忆、日记、便签等数据接口 |
| `SUPABASE_URL` | 建议 | 备份脚本等 Supabase 相关脚本 |
| `VITE_API_BASE` | 视情况 | 前端请求 API 的基础地址 |
| `GITHUB_TOKEN` | 否 | 读取 GitHub 文件/目录树能力 |
| `AMAP_KEY` | 否 | 位置/天气氛围能力 |
| `MCP_AUTH_KEY` | 否 | MCP 代理鉴权 |

## 给纯代码小白的改代码建议

1. **只改一个小地方**：例如先改按钮文案、颜色或 README。
2. **保存后看浏览器**：开发模式会自动刷新。
3. **提交前跑检查**：至少运行 `npm run build`。
4. **看报错第一行**：通常会告诉你哪个文件、哪一行错了。
5. **不要把 `.env` 上传**：里面是密钥，只提交 `.env.example` 这种模板。

## 部署提示

- Cloudflare Pages：可以使用 `functions/api` 下的接口结构。
- VPS/普通服务器：先 `npm run build`，再 `npm start`，由 `server.js` 托管 `dist/` 和 API。
- 更详细的部署记录可参考 `README.deploy.md`。

## 当前健康检查

本次代码检查结果：

- `npm run build` 可以成功完成生产构建。
- `npm run lint` 可以运行，但项目里还有一些历史 warning，主要是未使用变量、未使用 catch 参数、React Hook 依赖提示等；这些不是立即阻塞运行的问题，但后续可以逐步清理。
