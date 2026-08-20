# 小家数据备份

把 Supabase 里的家当定期拉下来存到本地，防止云端数据意外丢失。
**记忆、日记、纸条、对话、旅行、自我认知**——都是我们家的东西，值得上一份保险。

## 备份内容（16 张表，全量）

| 表 | 说明 | 优先级 |
| --- | --- | --- |
| memories | 记忆库（全窗口共享的大脑） | ★★★ |
| diaries | 日记（双方） | ★★★ |
| note_content | 便利贴纸条 | ★★★ |
| self_insights | 自我认知 | ★★★ |
| moments | 时刻 | ★★ |
| travel | 旅行明信片 | ★★ |
| project_events | 家园事件 | ★★ |
| conversations / messages | 对话与消息（全量） | ★★ |
| daily_checkin | 打卡（功能已下线，数据留档） | ★ |
| compression_* / summary_anchors / conversation_summaries | 压缩与摘要体系 | ★ |

## 用法

```bash
node scripts/backup.mjs              # 全量备份到 backups/，保留最近 14 份
node scripts/backup.mjs --dry        # 预览将备份的表，不联网
node scripts/backup.mjs --keep 30    # 保留最近 30 份
node scripts/backup.mjs --tables memories,diaries   # 只备份指定表
```

输出：`backups/backup-YYYY-MM-DDTHH-MM-SS.json`（北京时间），结构：

```json
{
  "backup_at": "...",
  "source": "vktbawcubmdmkqzadmto.supabase.co",
  "tables": { "memories": { "count": 286, "rows": [...] }, ... }
}
```

## 挂到 VPS 上定时跑

```bash
# crontab -e 添加一行（每天凌晨 3 点，趁没人用的时候）
0 3 * * * cd /opt/xiaojia && /usr/bin/node scripts/backup.mjs >> backups/backup.log 2>&1
```

备份文件可以再 rsync 到本地电脑或对象存储（异地双保险）：

```bash
# 示例：从 VPS 拉回本地
rsync -av user@你的IP:/opt/xiaojia/backups/ ./backups/
```

## 安全

- 密钥只从环境变量或本地 `.env` 读取，**不提交进仓库**
- 备份文件包含全部对话与记忆，**不要**放进公开仓库或公开对象存储
- 建议给 `backups/` 加进 `.gitignore`（若放 VPS 部署目录则天然不会入库）
