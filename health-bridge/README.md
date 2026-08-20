# 小家 · 健康桥（HealthBridge）

极简安卓 App：把**小米手环 → 小米运动健康 → Health Connect** 的健康数据，
读出来汇成每日摘要，推送到小家 VPS 的 `/api/health/sync`。
钟泽随后可通过 `get_health` MCP 工具「想看的时候看」。

> 不直接碰小米云，走系统级 Health Connect。以后换华为手环 / Apple Watch / Garmin，
> 只要它们也写 Health Connect，小家侧零改动。

## 架构

```
小米手环10
  ↓ 蓝牙
小米运动健康 App
  ↓ 写入
Health Connect（手机本机）
  ↓ 本 App 读取（已授权）
HTTPS POST → 小家 /api/health/sync
  ↓ service_role 落库
Supabase health_data 表
  ↓ get_health 工具
钟泽（想看时调用）
```

## 部署步骤

### 1. VPS 端（小家后端）—— 已完成 ✅
- `HEALTH_SYNC_TOKEN` 已写入 VPS `.env`（随机串，不进 git）。
- `functions/api/health/sync.js` 与 `get_health` 工具已部署：`/healthz` 200、无 token → 401。
- **唯一待办**：Supabase 后台 SQL Editor 执行 `supabase/health_data.sql`（建表 + RLS）。

### 2. App 端（本目录）
1. `Config.kt` 的 `SERVER_URL` 确认是你的小家域名（当前 `https://ling1018.com`）；`HEALTH_TOKEN` 已与 VPS 端对齐，本机保留真值、已 `skip-worktree` 保护——**不会被 push 到 GitHub**。若要改 token，先执行：
   ```
   git update-index --no-skip-worktree health-bridge/app/src/main/java/com/lingling/healthbridge/Config.kt
   ```
2. 用 **Android Studio** 打开本目录（首次会下载 AGP 8.5.2 / Kotlin 1.9.24 等依赖；用 Studio 自带 Gradle 即可，工程未带 wrapper）。
3. `Build → Build Bundle(s) / APK → Build APK`，装到手机。
4. 打开 App → 授权 Health Connect（睡眠 / 步数 / 心率）→ 点「立即同步」。
5. 如需每天自动同步，打开「每天自动同步」开关（WorkManager 每日执行）。
6. Android 14+ 系统自带 Health Connect；Android 13 需先装 Health Connect App。

## 同步字段

| 字段 | 来源 |
| --- | --- |
| `sleep_minutes` / 深睡·浅睡·REM | SleepSessionRecord（+ 各阶段） |
| `sleep_start` / `sleep_end` | 睡眠会话起止（按醒来日归属） |
| `steps` | StepsRecord 当日聚合 |
| `resting_hr` | RestingHeartRateRecord 当日最新 |
| `avg_hr` | HeartRateRecord.BPM 当日均值 |

## 隐私

- `health_data` 表仅 `service_role` 可读写，匿名不可读。
- 同步走 HTTPS，带 `x-health-token` 校验。
- 服务端不打印原始健康值。
