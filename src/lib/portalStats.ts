import { prisma } from '@/lib/db';
import type { AssigneeKind } from '@/lib/assignee';

export type PortalSubject = { kind: AssigneeKind; id: string };

export type PortalPerformanceStats = {
  assigned30d: number; // 최근 30일 배정 횟수(수락+거절 합산) — rankingStats.ts와 동일 정의
  accepted30d: number; // 최근 30일 중 수락(ACCEPTED)만
  avgRating: number | null; // null = 리뷰 0건(랭킹용 3.0 중립값과 달리 포털은 실측값만 보여준다)
  reviewCount: number;
};

const subjectWhere = (subject: PortalSubject) =>
  subject.kind === 'PROVIDER' ? { providerId: subject.id } : { technicianId: subject.id };

// 포털 성과 통계 카드(AC-3/AC-4)용 — rankingStats.ts:14-103의 집계 스타일(30일 cutoff,
// ACCEPTED+REJECTED 합산)을 단일 주체 조회로 미러링한다. 배치가 아니라 세션 주체 1명만
// 조회하므로 groupBy 대신 count/aggregate를 직접 쓴다.
export async function getPortalPerformanceStats(
  subject: PortalSubject,
): Promise<PortalPerformanceStats> {
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = subjectWhere(subject);

  const [assigned30d, accepted30d, reviewAgg] = await Promise.all([
    prisma.assignment.count({
      where: { ...where, status: { in: ['ACCEPTED', 'REJECTED'] }, respondedAt: { gte: cutoff30d } },
    }),
    prisma.assignment.count({
      where: { ...where, status: 'ACCEPTED', respondedAt: { gte: cutoff30d } },
    }),
    prisma.satisfactionSurvey.aggregate({
      where: { ...where, submittedAt: { not: null }, rating: { not: null } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  return {
    assigned30d,
    accepted30d,
    avgRating: reviewAgg._count._all > 0 ? reviewAgg._avg.rating : null,
    reviewCount: reviewAgg._count._all,
  };
}

export type PortalReview = { rating: number; comment: string | null };

// FNV-1a 32비트 해시 — 정렬 전용 안정 난수화(암호학적 용도 아님). 제출 시점(submittedAt)을
// select하지 않으므로 목록 순서에서 시간 정보를 유도할 수 없다(temporal unlinkability).
function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// 받은 후기 목록(AC-5 계약) — requestId·submittedAt·고객 식별정보는 select 자체에서 뺀다
// (UI에서 숨기는 게 아니라 서버가 아예 조회·응답하지 않는다). 정렬은 별점 내림차순 +
// 조사 id의 안정 해시로 2차 정렬해 제출 순서를 노출하지 않는다. n≥5 코멘트 임계는
// 이 함수의 책임이 아니라 호출부(API 라우트)가 reviewCount를 보고 적용한다.
export async function getPortalReviews(subject: PortalSubject): Promise<PortalReview[]> {
  const rows = await prisma.satisfactionSurvey.findMany({
    where: { ...subjectWhere(subject), submittedAt: { not: null }, rating: { not: null } },
    select: { id: true, rating: true, comment: true },
  });

  return rows
    .map((r) => ({ id: r.id, rating: r.rating as number, comment: r.comment }))
    .sort((a, b) => {
      if (a.rating !== b.rating) return b.rating - a.rating;
      return stableHash(a.id) - stableHash(b.id);
    })
    .map(({ rating, comment }) => ({ rating, comment }));
}

export type MonthlyCommission = { month: string; amount: number; count: number };

// 소개자(User) 기준 월별 수수료 집계 — CommissionEntry.referrerUserId 스코프.
// Provider/Technician.userId가 소개자 User.id와 동일하므로 세션의 userId를 그대로 쓴다
// (CommissionEntry.providerId/technicianId는 피소개자 스냅샷이라 이 주체 키로 쓸 수 없다).
// AC-6 "월별 집계 표시"는 결국 CommissionSummary.tsx가 이미 받아온 entries를 클라이언트에서
// 직접 월별로 묶는 방식으로 구현됐다(백엔드 무접촉 원칙 우선) — 이 함수는 서버측 집계가
// 필요해지는 경우(예: 50건 초과 이력의 정확한 전체 합계)를 위해 준비된 채로 남겨둔다.
export async function getReferrerMonthlyCommissions(
  referrerUserId: string,
): Promise<MonthlyCommission[]> {
  const entries = await prisma.commissionEntry.findMany({
    where: { referrerUserId },
    select: { amount: true, createdAt: true },
  });

  const byMonth = new Map<string, { amount: number; count: number }>();
  for (const e of entries) {
    const month = e.createdAt.toISOString().slice(0, 7); // "YYYY-MM"
    const cur = byMonth.get(month) ?? { amount: 0, count: 0 };
    byMonth.set(month, { amount: cur.amount + e.amount, count: cur.count + 1 });
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)) // 최신 월 우선
    .map(([month, v]) => ({ month, ...v }));
}
