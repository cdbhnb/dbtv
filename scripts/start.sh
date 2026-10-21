#!/usr/bin/env sh
set -eu

mkdir -p "${DATA_DIR:-./data}"
export DATABASE_URL="${DATABASE_URL:-file:./dev.db}"
npx prisma db push --schema prisma/schema.prisma --skip-generate
exec node server/dist/index.js
