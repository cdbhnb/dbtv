#!/usr/bin/env sh
set -eu

DB_PATH="${DB_PATH:-prisma/dev.db}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$BACKUP_DIR"
if [ ! -f "$DB_PATH" ]; then
  printf '%s\n' "数据库不存在：$DB_PATH" >&2
  exit 1
fi
STAMP=$(date +%Y%m%d-%H%M%S)
cp "$DB_PATH" "$BACKUP_DIR/dabiao-$STAMP.db"
printf '%s\n' "备份已保存到 $BACKUP_DIR/dabiao-$STAMP.db"
