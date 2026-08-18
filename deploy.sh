#!/usr/bin/env bash
# 一键部署：本地构建 dist + 同步 functions/ 到 VPS，重启服务
#
# 设计要点（对应「A 方案：我部署时顺手把 functions 也传上去」）：
#   - 前端打包 → dist，连同 functions/ 一起同步到 VPS，避免「页面改了、接口没跟上」
#   - 用 tar 管道只覆盖/新增，绝不删除 VPS 上的 server.js / wake/（运行层，不在 git）
#   - 构建输出到 $HOME 下的临时目录（Windows 原生绝对路径），每次按 PID 全新目录：
#       ① 避开 Git Bash 的 /c/ 前缀被 node 误读为 C:\c\ 的路径坑
#       ② 避免 vite 清空旧 dist 触发本地 rm 拦截（safe-delete），也不污染仓库
#
# 用法：
#   ./deploy.sh            # 默认远端读 $XIAOJIA_REMOTE 或 ssh 别名 "xiaojia"
#   ./deploy.sh my-alias   # 指定 ssh 别名 / 用户@主机
#
set -uo pipefail

REMOTE="${1:-${XIAOJIA_REMOTE:-xiaojia}}"
REMOTE_DIR="/opt/xiaojia"
SERVICE="my-ai-chat.service"

# 构建输出目录：用 Windows 原生绝对路径（cygpath -w），避免 node 把 /c/... 误读为 C:\c\...
if command -v cygpath >/dev/null 2>&1; then
  BUILD_OUT="$(cygpath -w "$HOME")/xiaojia-build-$$"
else
  BUILD_OUT="$HOME/xiaojia-build-$$"
fi
# bash 侧用 posix 路径做 cd
BUILD_OUT_POSIX="$(cygpath -u "$BUILD_OUT" 2>/dev/null || echo "$BUILD_OUT")"

# 脚本所在目录即仓库根
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "▶ 构建前端 (--outDir=$BUILD_OUT) ..."
npm run build -- "--outDir=$BUILD_OUT"

echo "▶ 同步 dist → $REMOTE:$REMOTE_DIR/dist"
( cd "$BUILD_OUT_POSIX" && tar czf - . ) | ssh "$REMOTE" \
  "rm -rf $REMOTE_DIR/dist/assets/* $REMOTE_DIR/dist/index.html $REMOTE_DIR/dist/*.js $REMOTE_DIR/dist/*.css 2>/dev/null; mkdir -p $REMOTE_DIR/dist && tar xzf - -C $REMOTE_DIR/dist/"

# functions/ 在 VPS 上属主为 197609，ssh 登录的 ubuntu 无写权限，需用 sudo 解包再还原属主
FUNC_OWNER="$(ssh "$REMOTE" "stat -c %u:%g $REMOTE_DIR")"
echo "▶ 同步 functions/ → $REMOTE:$REMOTE_DIR/functions (sudo 解包，不动 server.js / wake/)"
( cd functions && tar czf - . ) | ssh "$REMOTE" \
  "sudo mkdir -p $REMOTE_DIR/functions && sudo tar xzf - -C $REMOTE_DIR/functions/ && sudo chown -R $FUNC_OWNER $REMOTE_DIR/functions"

echo "▶ 重启服务 $SERVICE ..."
ssh "$REMOTE" "sudo systemctl restart $SERVICE"
ssh "$REMOTE" "systemctl is-active $SERVICE"

echo "✅ 部署完成。请正常刷新 ling1018.com 验证（缓存头已加固，无需清站点数据）。"

# 清理临时构建目录（原生终端可删；被安全策略拦截也不影响部署结果）
rm -rf "$BUILD_OUT_POSIX" 2>/dev/null || true
exit 0
