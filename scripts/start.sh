#!/usr/bin/env sh
set -eu

node scripts/database.mjs prepare
if [ ! -f server/dist/index.js ] || [ ! -f client/dist/index.html ]; then
  echo "构建生产文件..."
  npm run build
fi
exec node server/dist/index.js
