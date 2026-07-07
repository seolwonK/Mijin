# syntax=docker/dockerfile:1

# ============================================================
# Mijin (Next.js 16 + Prisma/PostgreSQL) — CloudType 배포용
# 멀티스테이지: deps → builder → runner
# 런타임 이미지는 전체 의존성을 포함한다. 컨테이너 시작 시
# `prisma migrate deploy` 를 돌려야 하는데, Prisma CLI 는 전이 의존성
# (@prisma/config → effect 등)이 많아 부분 복사가 불안정하기 때문이다.
# ============================================================

# ---------- 1) deps: 의존성 설치 ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Prisma 엔진이 OpenSSL 을 요구
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2) builder: Prisma generate + next build ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client 생성 (스키마만 사용 — DB 연결 불필요)
RUN npx prisma generate

# next build 는 DB에 접속하지 않지만 Prisma Client 초기화를 위해 형식상 값이 필요할 수 있어 더미 지정
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- 3) runner: 런타임 이미지 ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# next start 는 이 값으로 바인딩 (CloudType 은 PORT 를 주입/사용)
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 앱 실행(next start) + 마이그레이션/시드(prisma, tsx)에 필요한 전체 의존성.
# generate 산출물(@prisma/client, .prisma)이 포함된 builder 의 node_modules 를 사용.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# 업로드 영속 디렉터리 — CloudType 스토리지를 /app/uploads 에 마운트할 것
RUN mkdir -p /app/uploads/biz-certs

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
