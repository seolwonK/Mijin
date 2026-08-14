// 알 크레딧 변동 단일 진입점 — eggBalance는 캐시, 진실원장은 EggLedger.
// 이 파일 밖에서 eggBalance를 increment/decrement/set 으로 직접 조작하는 것은 금지
// (읽기·표시는 허용). 근거: .omc/plans/ralplan-egg-credit.md Principle 1.
//
// 차감 멱등성: EggLedger.assignmentId @unique — 배정 1건 = 차감 최대 1회. 수락 CAS(1회만
// 성공)가 1차 방어, UNIQUE가 재시도·크래시 리플레이까지 막는 2차 방어(commission.ts 전례).
// 충전 멱등성: EggLedger.chargeKey @unique — 어드민 폼 제출당 클라이언트 생성 UUID.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assigneeFk, type AssigneeTarget } from '@/lib/assignee';

export const MIN_CHARGE_EGGS = 3; // 최소 충전 단위 (1알 = ₩10,000)

// 센티널 — 문자열 리터럴 비교의 취약성 회피 (트랜잭션 롤백 신호)
export const EGG_ZERO_BALANCE = 'EGG_ZERO_BALANCE' as const;

type SpendResult = 'SPENT' | 'ZERO_BALANCE' | 'ALREADY_SPENT';
type ChargeResult = 'CHARGED' | 'ALREADY_CHARGED';

// 잔액 조건부 차감 — updateMany where eggBalance >= 1 (음수 불가를 DB 조건으로 보장).
// 델리게이트 삼항은 유니언 시그니처(TS2349)로 컴파일 불가 — 명시 분기.
async function decrementIfPositive(
  tx: Prisma.TransactionClient,
  target: AssigneeTarget,
): Promise<number> {
  if (target.kind === 'PROVIDER') {
    const hit = await tx.provider.updateMany({
      where: { id: target.id, eggBalance: { gte: 1 } },
      data: { eggBalance: { decrement: 1 } },
    });
    return hit.count;
  }
  const hit = await tx.technician.updateMany({
    where: { id: target.id, eggBalance: { gte: 1 } },
    data: { eggBalance: { decrement: 1 } },
  });
  return hit.count;
}

// 배정 수락 직후 호출(수락 CAS 성공 경로에서만). 잔액≥1이면 -1 + 장부, 0이면 무차감 수락.
// 같은 assignmentId 재호출은 P2002 → ALREADY_SPENT (장부·잔액 무변동).
export async function spendEggOnAccept(
  target: AssigneeTarget,
  assignmentId: string,
): Promise<SpendResult> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.eggLedger.create({
        data: { ...assigneeFk(target), delta: -1, reason: 'ACCEPT_SPEND', assignmentId },
      });
      const count = await decrementIfPositive(tx, target);
      if (count === 0) throw new Error(EGG_ZERO_BALANCE); // 롤백 → 장부 행 소멸 = 무차감 수락
    });
    return 'SPENT';
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return 'ALREADY_SPENT';
    }
    if (e instanceof Error && e.message === EGG_ZERO_BALANCE) return 'ZERO_BALANCE';
    throw e; // 커넥션·타임아웃·버그는 삼키지 않는다 (commission.ts 관례)
  }
}

// 어드민 수동 충전 — 최소 3알, chargeKey 멱등(더블서브밋 방어).
export async function chargeEggs(
  target: AssigneeTarget,
  count: number,
  memo: string,
  actorAdminUserId: string,
  chargeKey: string,
): Promise<ChargeResult> {
  if (!Number.isInteger(count) || count < MIN_CHARGE_EGGS) {
    throw new Error(`최소 충전 단위는 ${MIN_CHARGE_EGGS}알입니다`);
  }
  if (!memo.trim()) throw new Error('충전 사유(memo)는 필수입니다');
  if (!chargeKey.trim()) throw new Error('chargeKey는 필수입니다');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.eggLedger.create({
        data: {
          ...assigneeFk(target),
          delta: count,
          reason: 'CHARGE',
          memo,
          actorAdminUserId,
          chargeKey,
        },
      });
      if (target.kind === 'PROVIDER') {
        await tx.provider.update({
          where: { id: target.id },
          data: { eggBalance: { increment: count } },
        });
      } else {
        await tx.technician.update({
          where: { id: target.id },
          data: { eggBalance: { increment: count } },
        });
      }
    });
    return 'CHARGED';
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return 'ALREADY_CHARGED';
    }
    throw e;
  }
}

// 어드민 정정(양·음) — 결과 잔액 ≥ 0 을 DB 조건으로 보장(감액 시 updateMany where gte).
export async function adjustEggs(
  target: AssigneeTarget,
  delta: number,
  memo: string,
  actorAdminUserId: string,
): Promise<void> {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('delta는 0이 아닌 정수여야 합니다');
  if (!memo.trim()) throw new Error('정정 사유(memo)는 필수입니다');
  await prisma.$transaction(async (tx) => {
    await tx.eggLedger.create({
      data: { ...assigneeFk(target), delta, reason: 'ADMIN_ADJUST', memo, actorAdminUserId },
    });
    const where =
      delta < 0
        ? { id: target.id, eggBalance: { gte: -delta } } // 감액은 잔액 충분할 때만
        : { id: target.id };
    const hit =
      target.kind === 'PROVIDER'
        ? await tx.provider.updateMany({ where, data: { eggBalance: { increment: delta } } })
        : await tx.technician.updateMany({ where, data: { eggBalance: { increment: delta } } });
    if (hit.count === 0) throw new Error('정정 결과 잔액이 음수가 되거나 대상이 없습니다');
  });
}

// 본인 알 순위 — 같은 종류(kind) 내, 배정 자격자 풀 기준(업체: 활성·승인 / 기사: +계약 CONFIRMED).
// 동률 공동 순위: (풀에서 내 잔액보다 큰 수) + 1. 타인 정보는 반환하지 않는다(스칼라만).
export async function getMyEggRank(
  target: AssigneeTarget,
): Promise<{ balance: number; rank: number; poolSize: number } | null> {
  if (target.kind === 'PROVIDER') {
    const me = await prisma.provider.findUnique({
      where: { id: target.id },
      select: { eggBalance: true },
    });
    if (!me) return null;
    const pool = { isActive: true, approvalStatus: 'APPROVED' as const };
    const [above, poolSize] = await Promise.all([
      prisma.provider.count({ where: { ...pool, eggBalance: { gt: me.eggBalance } } }),
      prisma.provider.count({ where: pool }),
    ]);
    return { balance: me.eggBalance, rank: above + 1, poolSize };
  }
  const me = await prisma.technician.findUnique({
    where: { id: target.id },
    select: { eggBalance: true },
  });
  if (!me) return null;
  const pool = {
    isActive: true,
    approvalStatus: 'APPROVED' as const,
    contract: { status: 'CONFIRMED' as const },
  };
  const [above, poolSize] = await Promise.all([
    prisma.technician.count({ where: { ...pool, eggBalance: { gt: me.eggBalance } } }),
    prisma.technician.count({ where: pool }),
  ]);
  return { balance: me.eggBalance, rank: above + 1, poolSize };
}
