import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { customerAcceptSampleSql } from '@/lib/analyticsStats';

// F8 실행형 회귀 — 접수 1건에 ACCEPTED 이력이 2행이어도 표본은 최종 수락 1건만 기여한다.
// 프로덕션과 동일한 SQL(customerAcceptSampleSql)을 실제 PostgreSQL에서 실행한다.
// DATABASE_URL이 없으면 스킵(로컬/CI 공통 안전).
const hasDb = Boolean(process.env.DATABASE_URL);

// 다른 시드 데이터와 절대 겹치지 않는 과거 고정 창(2020-02-01 ~ 2020-02-02 UTC).
const RANGE = { gte: new Date('2020-02-01T00:00:00Z'), lt: new Date('2020-02-02T00:00:00Z') };
const LOOKUP = '000f8t';

describe.runIf(hasDb)('F8 customer-accept dedupe (real PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let requestId: string;

  beforeAll(async () => {
    await cleanup(prisma);
    const provider = await prisma.provider.findFirst();
    if (!provider) throw new Error('시드 provider가 필요합니다 (npx prisma db seed)');
    const request = await prisma.serviceRequest.create({
      data: {
        lookupCode: LOOKUP,
        customerName: 'F8 픽스처',
        customerPhone: '01000000000',
        description: 'F8 dedupe 실행형 회귀 픽스처',
        urgency: 'NORMAL',
        status: 'ACCEPTED',
        createdAt: new Date('2020-02-01T00:00:00Z'),
      },
    });
    requestId = request.id;
    // 동일 접수에 ACCEPTED 이력 2행 — 재배정/경합 시나리오.
    await prisma.assignment.create({
      data: {
        requestId,
        providerId: provider.id,
        status: 'ACCEPTED',
        assignedBy: 'ADMIN',
        respondedAt: new Date('2020-02-01T00:01:40Z'), // +100s (과거 이력)
        createdAt: new Date('2020-02-01T00:00:10Z'),
      },
    });
    await prisma.assignment.create({
      data: {
        requestId,
        providerId: provider.id,
        status: 'ACCEPTED',
        assignedBy: 'ADMIN',
        respondedAt: new Date('2020-02-01T00:03:20Z'), // +200s (최종 수락)
        createdAt: new Date('2020-02-01T00:02:00Z'),
      },
    });
  });

  afterAll(async () => {
    await cleanup(prisma);
    await prisma.$disconnect();
  });

  it('접수당 표본 1건 — 최종 respondedAt 기준 200초', async () => {
    const samples = await prisma.$queryRaw<Array<{ requestId: string; seconds: number }>>(
      customerAcceptSampleSql(RANGE),
    );
    const mine = samples.filter((row) => row.requestId === requestId);
    expect(mine).toHaveLength(1);
    expect(Number(mine[0].seconds)).toBe(200);
  });
});

async function cleanup(prisma: PrismaClient) {
  const existing = await prisma.serviceRequest.findUnique({ where: { lookupCode: LOOKUP } });
  if (!existing) return;
  await prisma.assignment.deleteMany({ where: { requestId: existing.id } });
  await prisma.serviceRequest.delete({ where: { id: existing.id } });
}
