#!/bin/sh
set -e

echo "[entrypoint] prisma migrate deploy 실행"
prisma migrate deploy

# SEED_ON_BOOT=true 일 때만 시드 실행 (upsert라 여러 번 실행해도 안전.
# 단 테스트 계정 partner1~3이 생성되므로 운영에서는 최초 1회만 켰다가 끌 것)
if [ "$SEED_ON_BOOT" = "true" ]; then
  echo "[entrypoint] 시드 실행 (prisma/seed.ts)"
  tsx prisma/seed.ts
fi

exec node server.js
