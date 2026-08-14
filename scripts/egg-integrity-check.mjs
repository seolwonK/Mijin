#!/usr/bin/env node
// 알 크레딧 무결성 검사 (ralplan-egg-credit.md E-3) — 운영 정기 실행 가능.
//   (i)  전 대상 SUM(ledger.delta) == eggBalance
//   (ii) ACCEPT_SPEND의 assignmentId가 전부 실재 + ACCEPTED 배정 참조 (FK 부재 보완)
//   (iii) 크래시 창 — ACCEPTED인데 스펜드 행이 없고, 수락 시점 잔액(장부 역재생)이 >0이던 배정
//   (iv) 리젝트 파밍 가시성 — 30일 거절률 × 현재 잔액 상위 리포트
// 종료 코드: (i)~(iii) 위반이 하나라도 있으면 1, 아니면 0. (iv)는 리포트 전용.
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ quiet: true });
const prisma = new PrismaClient();

let violations = 0;
const fail = (msg) => {
  violations += 1;
  console.error(`✗ ${msg}`);
};

// (i) 캐시-장부 정합
async function checkBalances(kind) {
  const model = kind === 'PROVIDER' ? prisma.provider : prisma.technician;
  const fk = kind === 'PROVIDER' ? 'providerId' : 'technicianId';
  const rows = await model.findMany({ select: { id: true, eggBalance: true } });
  const sums = await prisma.eggLedger.groupBy({
    by: [fk],
    where: { [fk]: { not: null } },
    _sum: { delta: true },
  });
  const sumMap = new Map(sums.map((s) => [s[fk], s._sum.delta ?? 0]));
  for (const row of rows) {
    const expected = sumMap.get(row.id) ?? 0;
    if (row.eggBalance !== expected) {
      fail(`(i) ${kind} ${row.id}: eggBalance=${row.eggBalance} ≠ SUM(delta)=${expected}`);
    }
  }
  return rows.length;
}

// (ii) 스펜드 행의 배정 참조 무결성
async function checkSpendRefs() {
  const spends = await prisma.eggLedger.findMany({
    where: { reason: 'ACCEPT_SPEND' },
    select: { id: true, assignmentId: true },
  });
  for (const s of spends) {
    if (!s.assignmentId) {
      fail(`(ii) 스펜드 행 ${s.id}: assignmentId 없음`);
      continue;
    }
    const a = await prisma.assignment.findUnique({
      where: { id: s.assignmentId },
      select: { status: true },
    });
    if (!a) fail(`(ii) 스펜드 행 ${s.id}: 배정 ${s.assignmentId} 실재하지 않음`);
    else if (a.status !== 'ACCEPTED') {
      fail(`(ii) 스펜드 행 ${s.id}: 배정 상태 ${a.status} (ACCEPTED 아님)`);
    }
  }
  return spends.length;
}

// (iii) 크래시 창 — 수락됐는데 차감 누락(당시 잔액>0)
// 수락 시점 잔액 = 현재 잔액 − (respondedAt 이후 delta 합). P1(전 변동 장부화)이 보장하는 재생.
// 기능 도입 전 배정은 잔액 0으로 재구성되므로 오탐 없음.
async function checkCrashWindow() {
  const accepted = await prisma.assignment.findMany({
    where: { status: 'ACCEPTED' },
    select: { id: true, providerId: true, technicianId: true, respondedAt: true },
  });
  let flagged = 0;
  for (const a of accepted) {
    const spend = await prisma.eggLedger.findUnique({ where: { assignmentId: a.id } });
    if (spend) continue;
    const kind = a.providerId ? 'PROVIDER' : 'TECHNICIAN';
    const id = a.providerId ?? a.technicianId;
    const fk = a.providerId ? 'providerId' : 'technicianId';
    const model = a.providerId ? prisma.provider : prisma.technician;
    const target = await model.findUnique({ where: { id }, select: { eggBalance: true } });
    if (!target) continue;
    const after = await prisma.eggLedger.aggregate({
      where: { [fk]: id, createdAt: { gt: a.respondedAt ?? new Date(0) } },
      _sum: { delta: true },
    });
    const balanceAtAccept = target.eggBalance - (after._sum.delta ?? 0);
    if (balanceAtAccept > 0) {
      flagged += 1;
      fail(`(iii) 배정 ${a.id} (${kind} ${id}): 수락 시점 잔액 ${balanceAtAccept}>0인데 스펜드 행 없음 (크래시 창 의심)`);
    }
  }
  return { total: accepted.length, flagged };
}

// (iv) 리젝트 파밍 리포트 (전용 — 실패 아님)
async function rejectFarmingReport() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const holders = [
    ...(await prisma.provider.findMany({
      where: { eggBalance: { gt: 0 } },
      select: { id: true, eggBalance: true, user: { select: { name: true } } },
    })).map((p) => ({ kind: 'PROVIDER', fk: 'providerId', ...p })),
    ...(await prisma.technician.findMany({
      where: { eggBalance: { gt: 0 } },
      select: { id: true, eggBalance: true, user: { select: { name: true } } },
    })).map((t) => ({ kind: 'TECHNICIAN', fk: 'technicianId', ...t })),
  ];
  const rows = [];
  for (const h of holders) {
    const [rejected, responded] = await Promise.all([
      prisma.assignment.count({
        where: { [h.fk]: h.id, status: 'REJECTED', respondedAt: { gte: cutoff } },
      }),
      prisma.assignment.count({
        where: { [h.fk]: h.id, status: { in: ['ACCEPTED', 'REJECTED'] }, respondedAt: { gte: cutoff } },
      }),
    ]);
    if (responded > 0) {
      rows.push({
        이름: h.user.name,
        종류: h.kind,
        잔액: h.eggBalance,
        '30일 거절률': `${Math.round((rejected / responded) * 100)}% (${rejected}/${responded})`,
      });
    }
  }
  rows.sort((a, b) => b.잔액 - a.잔액);
  if (rows.length > 0) {
    console.log('\n(iv) 알 보유자 거절률 리포트 (리젝트 파밍 가시성):');
    console.table(rows.slice(0, 10));
  } else {
    console.log('\n(iv) 알 보유자 중 30일 내 응답 이력 없음 — 리포트 생략');
  }
}

const [pCount, tCount] = await Promise.all([checkBalances('PROVIDER'), checkBalances('TECHNICIAN')]);
const spendCount = await checkSpendRefs();
const crash = await checkCrashWindow();
await rejectFarmingReport();
await prisma.$disconnect();

console.log(
  `\n검사 완료 — 대상 업체 ${pCount}·기사 ${tCount}, 스펜드 행 ${spendCount}, ACCEPTED 배정 ${crash.total}(크래시 창 ${crash.flagged})`,
);
if (violations > 0) {
  console.error(`\n무결성 위반 ${violations}건`);
  process.exit(1);
}
console.log('무결성 위반 0건 ✓');
