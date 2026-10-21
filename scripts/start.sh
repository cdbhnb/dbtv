#!/usr/bin/env sh
set -eu

mkdir -p "${DATA_DIR:-./data}"
export DATABASE_URL="${DATABASE_URL:-file:./dev.db}"
npx prisma db push --schema prisma/schema.prisma --skip-generate
if [ ! -f server/dist/index.js ] || [ ! -f client/dist/index.html ]; then
  echo "构建生产文件..."
  npm run build
fi
exec node server/dist/index.js
