// 알 크레딧 머니 테스트 — 실제 PostgreSQL 필수.
// ⚠️ runIf 금지(플랜 v5): DB가 없으면 조용히 스킵되어 60/60 그린으로 출하되는 함정 실측됨.
// dotenv를 직접 로드하고, 그래도 DATABASE_URL이 없으면 하드 페일한다.
import { config as loadEnv } from 'dotenv';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

loadEnv({ quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[eggs.db.test] DATABASE_URL 필수 — 알 멱등성·레이스 테스트는 스킵 불가(머니 테스트 하드 페일 규칙)',
  );
}

import { prisma } from '@/lib/db';
import { chargeEggs, adjustEggs, spendEggOnAccept, MIN_CHARGE_EGGS } from '@/lib/eggs';

const T_PHONE = '01099998801'; // QA 예약 번호대(9999) — 세션 관례
let providerId: string;
let userId: string;

const key = () => `eggtest-${crypto.randomUUID()}`;

async function balance(): Promise<number> {
  const p = await prisma.provider.findUniqueOrThrow({
    where: { id: providerId },
    select: { eggBalance: true },
  });
  return p.eggBalance;
}

async function ledgerCount(): Promise<number> {
  return prisma.eggLedger.count({ where: { providerId } });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      name: '알테스트업체',
      phone: T_PHONE,
      role: 'PROVIDER',
      loginId: `eggtest-${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: 'x', // 로그인하지 않는 픽스처 — 해시 불필요
    },
  });
  userId = user.id;
  const provider = await prisma.provider.create({
    data: { userId, address: '서울특별시 강남구 알테스트로 1', approvalStatus: 'APPROVED' },
  });
  providerId = provider.id;
});

beforeEach(async () => {
  // 각 케이스는 깨끗한 잔액 0·장부 0에서 시작
  await prisma.eggLedger.deleteMany({ where: { providerId } });
  await prisma.provider.update({ where: { id: providerId }, data: { eggBalance: 0 } });
});

afterAll(async () => {
  await prisma.eggLedger.deleteMany({ where: { providerId } });
  await prisma.provider.delete({ where: { id: providerId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('chargeEggs (실 DB)', () => {
  it(`최소 충전 단위 ${MIN_CHARGE_EGGS}알 미만은 거부한다`, async () => {
    await expect(
      chargeEggs({ kind: 'PROVIDER', id: providerId }, MIN_CHARGE_EGGS - 1, '테스트', 'admin', key()),
    ).rejects.toThrow('최소 충전');
    expect(await balance()).toBe(0);
    expect(await ledgerCount()).toBe(0);
  });

  it('정상 충전은 잔액과 장부를 함께 갱신한다', async () => {
    const r = await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '입금 확인', 'admin', key());
    expect(r).toBe('CHARGED');
    expect(await balance()).toBe(3);
    expect(await ledgerCount()).toBe(1);
  });

  it('같은 chargeKey 재제출은 멱등 no-op이다 (더블서브밋 방어)', async () => {
    const k = key();
    expect(await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '입금 확인', 'admin', k)).toBe(
      'CHARGED',
    );
    expect(await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '입금 확인', 'admin', k)).toBe(
      'ALREADY_CHARGED',
    );
    expect(await balance()).toBe(3); // 6이 아님
    expect(await ledgerCount()).toBe(1);
  });
});

describe('spendEggOnAccept (실 DB)', () => {
  it('잔액이 있으면 1알 차감 + 장부 1행 (SPENT)', async () => {
    await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '충전', 'admin', key());
    const r = await spendEggOnAccept({ kind: 'PROVIDER', id: providerId }, key());
    expect(r).toBe('SPENT');
    expect(await balance()).toBe(2);
    expect(await ledgerCount()).toBe(2); // CHARGE + ACCEPT_SPEND
  });

  it('잔액 0이면 무차감 수락 (ZERO_BALANCE) — 장부 행도 남지 않는다(롤백)', async () => {
    const r = await spendEggOnAccept({ kind: 'PROVIDER', id: providerId }, key());
    expect(r).toBe('ZERO_BALANCE');
    expect(await balance()).toBe(0);
    expect(await ledgerCount()).toBe(0);
  });

  it('같은 assignmentId 2회 호출 → 장부 1행·잔액 -1 (멱등성 — 이중차감의 1차 증거)', async () => {
    await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '충전', 'admin', key());
    const assignmentId = key();
    expect(await spendEggOnAccept({ kind: 'PROVIDER', id: providerId }, assignmentId)).toBe('SPENT');
    expect(await spendEggOnAccept({ kind: 'PROVIDER', id: providerId }, assignmentId)).toBe(
      'ALREADY_SPENT',
    );
    expect(await balance()).toBe(2); // 1이 아님
    expect(
      await prisma.eggLedger.count({ where: { providerId, reason: 'ACCEPT_SPEND' } }),
    ).toBe(1);
  });

  it('오버스펜드 레이스: 잔액 1·서로 다른 배정 2건 동시 → 정확히 SPENT 1 + ZERO_BALANCE 1', async () => {
    await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '충전', 'admin', key());
    await adjustEggs({ kind: 'PROVIDER', id: providerId }, -2, '레이스 셋업', 'admin');
    expect(await balance()).toBe(1);

    const results = await Promise.all([
      spendEggOnAccept({ kind: 'PROVIDER', id: providerId }, key()),
      spendEggOnAccept({ kind: 'PROVIDER', id: providerId }, key()),
    ]);
    expect(results.filter((r) => r === 'SPENT')).toHaveLength(1);
    expect(results.filter((r) => r === 'ZERO_BALANCE')).toHaveLength(1);
    expect(await balance()).toBe(0); // -1이 아님 — Option A의 존재 이유
    expect(
      await prisma.eggLedger.count({ where: { providerId, reason: 'ACCEPT_SPEND' } }),
    ).toBe(1);
  });
});

describe('adjustEggs (실 DB)', () => {
  it('감액 결과가 음수가 되면 거부하고 장부도 남기지 않는다(롤백)', async () => {
    await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '충전', 'admin', key());
    await expect(
      adjustEggs({ kind: 'PROVIDER', id: providerId }, -4, '과감액 시도', 'admin'),
    ).rejects.toThrow('음수');
    expect(await balance()).toBe(3);
    expect(await ledgerCount()).toBe(1); // CHARGE만
  });

  it('정상 정정은 잔액·장부 동시 갱신', async () => {
    await chargeEggs({ kind: 'PROVIDER', id: providerId }, 3, '충전', 'admin', key());
    await adjustEggs({ kind: 'PROVIDER', id: providerId }, -1, '환불 1알', 'admin');
    expect(await balance()).toBe(2);
    expect(await ledgerCount()).toBe(2);
  });
});
