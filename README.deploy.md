# 小家（my-ai-chat）VPS 自托管部署指南

把「小家」常驻到你的 VPS：前端静态页 + 接口（Cloudflare Pages Functions 格式）由同一个零依赖
Node 运行时 `server.js` 托管，数据库仍用已有的 Supabase 云。这样小家 7×24 在线，手机随时能聊，
记忆/日记本就存在 Supabase，不依赖你电脑开机。

## 这套方案做了什么

| 能力 | 说明 |
| --- | --- |
| 接口常在线 | `server.js` 原样兼容 `functions/api` 下的 `onRequest*` 函数（`context.env` / `context.params` / Web `Request`/`Response`），无需改写 functions。 |
| 前端常驻 | 托管 `dist/` 静态文件，SPA 路由回退到 `index.html`。 |
| 健康检查 | `GET /healthz` 返回 `{"ok":true,...}`，供 systemd / 监控 / 负载均衡探活。 |
| 免运维 | systemd 守护进程，崩溃自动拉起；nginx 反代 + HTTPS。 |
| 可扩展 | 未来加 MCP 小工具 / 小游戏，照着 `functions/api` 格式新增文件即可（见文末）。 |

零新增 npm 依赖：`server.js` 只用 Node 内置模块 + 全局 `fetch/Request/Response`（Node ≥18，推荐 ≥20）。

## 本地已验证

`server.js` 已在本机跑通：静态首页、`/healthz`、动态路由 `/api/conversations/:id`、
`OPTIONS` 预检、`POST` 请求体解析、以及函数真实调用 Supabase（仅因本地未配密钥返回 401）均正常。

## 一、在 VPS 上首次部署

### 1. 前置
- VPS 装好：Node.js ≥ 18（推荐 20 LTS）、nginx、systemd、certbot（可选，用于 HTTPS）。
- 把仓库传到 VPS（git clone 或 `deploy/deploy.sh`）。

### 2. 放置密钥
在 VPS 部署目录（默认 `/opt/xiaojia`）创建 `.env`，参照 `deploy/.env.server.example` 填值：
- `SUPABASE_SECRET_KEY`（service_role，函数服务端用，勿暴露前端）
- `DEEPSEEK_API_KEY`
- 其余 `CONTEXT_*` / `GITHUB_*` 可选
- 若**在 VPS 上构建前端**，还需 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_DEEPSEEK_API_KEY`
  （若在本地构建后再同步，则这些已打进 `dist`，无需在 VPS 配）。
- `HOST=127.0.0.1`（由 nginx 反代对外，更安全）

> 运行所需文件：`server.js` + `dist/` + `functions/`（functions 必须随行，运行时被 import）。

### 3. 进程守护（systemd）
```bash
sudo cp deploy/my-ai-chat.service /etc/systemd/system/xiaojia.service
sudo systemctl daemon-reload
sudo systemctl enable --now xiaojia
# 查状态： sudo systemctl status xiaojia ；日志： journalctl -u xiaojia -f
```

### 4. 反代 + HTTPS（nginx）
```bash
sudo cp deploy/nginx-my-ai-chat.conf /etc/nginx/sites-available/xiaojia
sudo ln -s /etc/nginx/sites-available/xiaojia /etc/nginx/sites-enabled/
# 把配置里的 xiaojia.example.com 改成你的域名（无域名先保留 IP 临时访问）
sudo nginx -t && sudo systemctl reload nginx
# 有域名时申请证书（会自动改写配置补全 443/跳转）：
sudo certbot --nginx -d xiaojia.example.com
```

### 5. 探活
```bash
curl http://127.0.0.1:3000/healthz   # {"ok":true,...}
```

## 二、后续更新（一键）

在**本地**执行（需能 ssh 免密到 VPS）：
```bash
VPS_HOST=user@你的IP ./deploy/deploy.sh
```
脚本会：本地 `npm run build` → rsync 同步 `dist/ server.js functions package.json` 到 VPS
（**不同步 `.env`**，密钥留在 VPS）→ 重启 systemd 服务 → 探活。

## 三、日常运维

| 操作 | 命令 |
| --- | --- |
| 看服务状态 | `sudo systemctl status xiaojia` |
| 看实时日志 | `journalctl -u xiaojia -f` |
| 手动重启 | `sudo systemctl restart xiaojia` |
| 看健康检查 | `curl http://127.0.0.1:3000/healthz` |
| 改密钥后生效 | 编辑 `/opt/xiaojia/.env` 后 `sudo systemctl restart xiaojia` |

环境变量（运行时）：`PORT`（默认 3000）、`HOST`（默认 0.0.0.0）、
`STATIC_DIR`（默认 `dist`）、`FUNCTIONS_DIR`（默认 `functions/api`）。

## 四、给小家加 MCP 小工具 / 小游戏（扩展点）

`server.js` 的路由是**自动扫描** `functions/api` 的，所以新增能力无需改运行时：

1. **MCP 小工具**：在 `functions/api/tools/xxx.js` 写符合 Pages Functions 格式的导出
   （`export async function onRequestPost(context)`），前端用 `fetch('/api/tools/xxx', ...)` 调用即可。
   已有的 `functions/api/mcp.js` / `mcp-proxy.js` 就是这类服务的范例。
2. **小游戏**：同理在 `functions/api/games/xxx.js` 放接口；前端页面（如 `src/components/...`）
   通过同源相对地址 `/api/games/xxx` 访问。静态资源放 `public/` 会随 `dist` 一起被托管。
3. 需要服务端状态/持久化时，直接复用 Supabase（已有 `memories` 等表）或新建表。

> 关键点：前端调用地址已是**同源相对**（`API_BASE = import.meta.env.VITE_API_BASE || ''`），
> 所以在任何域名/端口下都能直接 `/api/...`，无需为扩展改配置。

## 五、注意事项

- 前端 8 处原本硬编码 `my-ai-chat-4zy.pages.dev`，已全部改为同源相对/可配置，迁到 VPS 后浏览器不再打到 Cloudflare。
- `functions/` 未做任何改写，仅被 `server.js` import（符合"只读目录只增量"的约束）。
- 本地 `npm run build` 若报 "safe-delete / trash" 错误，是开发机沙箱删除钩子所致，
  手动 `rm -rf dist` 后再构建即可；VPS 上正常，不受影响。
- 尚未提交/推送 git（按约定，等你本地预览确认效果后再 commit/push）。
