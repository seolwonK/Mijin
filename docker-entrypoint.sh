#!/bin/sh
set -e

# 값에 따옴표/앞뒤 공백/CR 이 섞여 들어오는 흔한 붙여넣기 실수를 방어
DATABASE_URL="$(printf '%s' "${DATABASE_URL}" | tr -d '\r' | sed -e 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^["'"'"']//; s/["'"'"']$//')"
export DATABASE_URL

# DATABASE_URL 미설정 시 즉시 실패 (원인 파악이 쉽도록)
if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL 환경변수가 없습니다. CloudType 환경변수를 확인하세요." >&2
  exit 1
fi

# 프로토콜 검증 — Prisma 의 난해한 wasm 오류 대신 친절한 안내로 대체
case "$DATABASE_URL" in
  postgresql://*|postgres://*) : ;;
  *)
    echo "[entrypoint] ERROR: DATABASE_URL 이 postgresql:// (또는 postgres://) 로 시작하지 않습니다." >&2
    echo "[entrypoint]  CloudType 환경변수 값에서 따옴표를 빼고 다음 형식으로 넣으세요:" >&2
    echo "[entrypoint]  postgresql://<사용자>:<비번>@<호스트>:5432/<DB>?schema=public" >&2
    exit 1 ;;
esac

# CLI는 패키지 진입점을 직접 호출한다. (.bin 심링크는 Docker COPY 시 실제 파일로
# 복사되며 형제 wasm/asset 을 잃어 깨지므로 사용하지 않는다.)
echo "[entrypoint] Prisma 마이그레이션 적용 (migrate deploy)..."
node ./node_modules/prisma/build/index.js migrate deploy

# 최초 배포에서만 RUN_DB_SEED=1 로 관리자/샘플 계정 시드 (upsert라 재실행해도 안전)
if [ "$RUN_DB_SEED" = "1" ]; then
  echo "[entrypoint] DB 시드 실행 (RUN_DB_SEED=1)..."
  node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts || echo "[entrypoint] WARN: 시드 실패 — 무시하고 계속"
fi

echo "[entrypoint] 앱 시작: $*"
exec "$@"
