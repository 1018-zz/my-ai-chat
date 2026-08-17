#!/usr/bin/env bash
# deploy/deploy.sh — 本地一键发布到 VPS
#
# 前置：
#   - 本地已 npm install 且能 `npm run build`
#   - VPS 已就绪：装好 node(>=18)、nginx、systemd，且已放置 /opt/xiaojia/.env（密钥）
#   - 本机能用 ssh 免密登录 VPS（ssh-copy-id）
#
# 用法：
#   VPS_HOST=user@1.2.3.4 VPS_DIR=/opt/xiaojia ./deploy/deploy.sh
#
# 说明：
#   - 只同步运行所需文件（dist 前端产物 / server.js / functions 接口 / package.json），
#     不同步 .env（密钥留在 VPS，本地不碰），也不同步 node_modules /.git。
#   - functions/ 必须随行：server.js 在运行时 import 它们（CF Functions 兼容层）。
set -euo pipefail

VPS_HOST="${VPS_HOST:?请设置 VPS_HOST，例如 user@ip}"
VPS_DIR="${VPS_DIR:-/opt/xiaojia}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> [1/3] 本地构建前端"
cd "$APP_DIR"
npm install
npm run build

echo "==> [2/3] 同步到 VPS: $VPS_HOST:$VPS_DIR"
ssh "$VPS_HOST" "mkdir -p $VPS_DIR"
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude dist.zip --exclude '*.log' \
  dist server.js functions package.json "$VPS_HOST:$VPS_DIR/"

echo "==> [3/3] 在 VPS 重启服务并探活"
ssh "$VPS_HOST" "sudo systemctl restart xiaojia && sleep 2 && curl -s http://127.0.0.1:3000/healthz || echo 'healthz 未响应'"

echo "==> 完成。浏览器打开你的域名即可访问小家。"
