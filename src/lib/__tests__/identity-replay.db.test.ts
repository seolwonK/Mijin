// 본인확인 재사용(리플레이) 방지 — 실제 PostgreSQL 필수.
//
// ⚠️ runIf 금지(eggs.db.test.ts 와 같은 규칙): DB가 없으면 조용히 스킵되어
//    "재사용 차단됨" 그린으로 출하되는 함정이 생긴다. 하드 페일한다.
//
// 막는 것: 한 번의 실제 통신사 인증(identityVerificationId 1건)으로 가입 토큰을 여러 개
// 발급받는 경로. 가입 시점의 consumedAt CAS 는 "발급된 토큰 1건"의 재사용만 막을 뿐,
// "인증 1건 → 토큰 N건"은 막지 못한다. 그 구멍은 replayKey 유니크 제약이 닫는다.
import { config as loadEnv } from 'dotenv';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

loadEnv({ quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[identity-replay.db.test] DATABASE_URL 필수 — 본인확인 재사용 차단은 스킵 불가',
  );
}

import { prisma } from '@/lib/db';
import { confirmIdentity, purgeAbandonedVerifications } from '@/lib/identity';
import { hashIdentityKey } from '@/lib/identity/hash';

const T_PHONE = '01099998802'; // QA 예약 번호대(9999) — 세션 관례
const createdIds: string[] = [];

/** 브라우저 SDK 가 만드는 40자 규격의 id (client.ts:newIdentityVerificationId). */
function newId(): string {
  return `iv${Date.now().toString(36).padStart(8, '0').slice(-8)}${'a'.repeat(24)}${Math.floor(
    Math.random() * 1e6,
  )
    .toString()
    .padStart(6, '0')}`;
}

/** PortOne 이 "인증 완료"로 답하는 상황을 고정한다. */
function stubVerified(id: string, over: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 'VERIFIED',
      id,
      verifiedAt: new Date().toISOString(),
      verifiedCustomer: {
        name: '홍길동',
        phoneNumber: T_PHONE,
        ci: 'CI-REPLAY-TEST',
        di: 'DI-REPLAY-TEST',
      },
      ...over,
    }),
    text: async () => '',
  }));
}

beforeEach(() => {
  vi.stubEnv('IDENTITY_PROVIDER', 'portone');
  vi.stubEnv('PORTONE_API_SECRET', 'test-secret');
  vi.stubEnv('PORTONE_STORE_ID', 'store-test');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (createdIds.length) {
    await prisma.identityVerification.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.identityVerification.deleteMany({ where: { phone: T_PHONE } });
  await prisma.$disconnect();
});

describe('confirmIdentity — 대행사 인증 1건 = 토큰 1건', () => {
  it('처음 제출한 인증건은 토큰을 발급한다', async () => {
    const id = newId();
    stubVerified(id);
    const first = await confirmIdentity({ identityVerificationId: id });
    createdIds.push(first.verificationId);

    expect(first.name).toBe('홍길동');
    expect(first.phone).toBe(T_PHONE);

    const row = await prisma.identityVerification.findUniqueOrThrow({
      where: { id: first.verificationId },
    });
    expect(row.provider).toBe('portone');
    expect(row.replayKey).toBe(`portone:${id}`);
    expect(row.consumedAt).toBeNull();

    // CI/DI 는 평문이 아니라 해시로만 남는다.
    expect(row.ciHash).toBe(hashIdentityKey('CI-REPLAY-TEST'));
    expect(row.ciHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('CI-REPLAY-TEST');
    expect(JSON.stringify(row)).not.toContain('DI-REPLAY-TEST');
  });

  it('같은 identityVerificationId 를 다시 제출하면 두 번째 토큰은 발급되지 않는다', async () => {
    const id = newId();
    stubVerified(id);
    const first = await confirmIdentity({ identityVerificationId: id });
    createdIds.push(first.verificationId);

    await expect(confirmIdentity({ identityVerificationId: id })).rejects.toThrow(
      '이미 사용된 본인인증입니다',
    );

    // 행이 늘지 않았다는 것이 실질 단언 — 재사용 시도가 토큰을 하나도 더 만들지 못했다.
    expect(
      await prisma.identityVerification.count({ where: { replayKey: `portone:${id}` } }),
    ).toBe(1);
  });

  it('동시에 같은 인증건을 제출해도 토큰은 하나만 남는다 (레이스)', async () => {
    const id = newId();
    stubVerified(id);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => confirmIdentity({ identityVerificationId: id })),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') createdIds.push(r.value.verificationId);
    }

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.identityVerification.count({ where: { replayKey: `portone:${id}` } }),
    ).toBe(1);
  });

  it('서로 다른 인증건은 각각 토큰을 받는다 (제약이 정상 가입을 막지 않는다)', async () => {
    const idA = newId();
    stubVerified(idA);
    const a = await confirmIdentity({ identityVerificationId: idA });
    createdIds.push(a.verificationId);

    const idB = newId();
    stubVerified(idB);
    const b = await confirmIdentity({ identityVerificationId: idB });
    createdIds.push(b.verificationId);

    expect(a.verificationId).not.toBe(b.verificationId);
  });

  it('오래된 인증건은 토큰 발급 전에 거부되어 행 자체가 생기지 않는다', async () => {
    const id = newId();
    stubVerified(id, { verifiedAt: new Date(Date.now() - 60 * 60_000).toISOString() });

    await expect(confirmIdentity({ identityVerificationId: id })).rejects.toThrow(
      '시간이 너무 지났습니다',
    );
    expect(
      await prisma.identityVerification.count({ where: { replayKey: `portone:${id}` } }),
    ).toBe(0);
  });
});

describe('purgeAbandonedVerifications — 보유기간', () => {
  /** 지정한 시점에 만료된 인증건을 직접 심는다(발급 경로를 타지 않는다). */
  async function seed(expiresAt: Date, consumedAt: Date | null) {
    const row = await prisma.identityVerification.create({
      data: {
        provider: 'portone',
        providerRef: `seed-${crypto.randomUUID()}`,
        replayKey: `portone:seed-${crypto.randomUUID()}`,
        name: '홍길동',
        phone: T_PHONE,
        expiresAt,
        consumedAt,
      },
    });
    createdIds.push(row.id);
    return row.id;
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60_000);

  it('가입까지 가지 못한 채 30일이 지난 인증건은 파기된다', async () => {
    const stale = await seed(daysAgo(31), null);
    await purgeAbandonedVerifications();
    expect(await prisma.identityVerification.findUnique({ where: { id: stale } })).toBeNull();
  });

  it('가입에 실제로 쓰인 인증건은 오래돼도 남긴다 (본인확인 이력)', async () => {
    const consumed = await seed(daysAgo(400), daysAgo(400));
    await purgeAbandonedVerifications();
    expect(
      await prisma.identityVerification.findUnique({ where: { id: consumed } }),
    ).not.toBeNull();
  });

  it('보유기간 안쪽의 미소비 인증건은 건드리지 않는다', async () => {
    const recent = await seed(daysAgo(3), null);
    await purgeAbandonedVerifications();
    expect(
      await prisma.identityVerification.findUnique({ where: { id: recent } }),
    ).not.toBeNull();
  });
});
