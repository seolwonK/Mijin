import { prisma } from '@/lib/db';

export type RefereeKind = 'PROVIDER' | 'TECHNICIAN';
export type RefereeApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ReferralOverviewReferee = {
  id: string;
  name: string;
  kind: RefereeKind;
  approvalStatus: RefereeApprovalStatus;
  joinedAt: Date;
  accruedPending: number;
  accruedPaid: number;
  pendingSurveyCount: number;
};

export type ReferralOverview = {
  referees: ReferralOverviewReferee[];
  totals: { refereeCount: number; pendingSurveyCount: number };
};

// 소개인(User) 기준 "내 추천 현황" — 가입 시 referredByUserId로 지정된 업체·기술자 목록(소급
// 지정은 관리자 전용이라 이 목록엔 나타나지 않는다) + 각자의 누적 적립(대기/지급완료)과 설문
// 대기 건수. groupBy + Map 병합은 rankingStats.ts:14-103과 동형 패턴(배치 집계, N+1 회피).
// 설문 대기(pendingSurveyCount)는 SatisfactionSurvey.submittedAt이 null인 건수만 센다 —
// paidAmount는 제출 전엔 unknown이라 적립 예정 금액은 절대 추정하지 않는다(건수만 노출).
export async function getReferralOverview(referrerUserId: string): Promise<ReferralOverview> {
  const [providers, technicians] = await Promise.all([
    prisma.provider.findMany({
      where: { referredByUserId: referrerUserId },
      select: { id: true, approvalStatus: true, appliedAt: true, user: { select: { name: true } } },
    }),
    prisma.technician.findMany({
      where: { referredByUserId: referrerUserId },
      select: { id: true, approvalStatus: true, appliedAt: true, user: { select: { name: true } } },
    }),
  ]);

  if (providers.length === 0 && technicians.length === 0) {
    return { referees: [], totals: { refereeCount: 0, pendingSurveyCount: 0 } };
  }

  const providerIds = providers.map((p) => p.id);
  const technicianIds = technicians.map((t) => t.id);

  const [
    commissionByProvider,
    commissionByTechnician,
    pendingSurveyByProvider,
    pendingSurveyByTechnician,
  ] = await Promise.all([
    providerIds.length === 0
      ? []
      : prisma.commissionEntry.groupBy({
          by: ['providerId', 'status'],
          where: { referrerUserId, providerId: { in: providerIds } },
          _sum: { amount: true },
        }),
    technicianIds.length === 0
      ? []
      : prisma.commissionEntry.groupBy({
          by: ['technicianId', 'status'],
          where: { referrerUserId, technicianId: { in: technicianIds } },
          _sum: { amount: true },
        }),
    providerIds.length === 0
      ? []
      : prisma.satisfactionSurvey.groupBy({
          by: ['providerId'],
          where: { providerId: { in: providerIds }, submittedAt: null },
          _count: { _all: true },
        }),
    technicianIds.length === 0
      ? []
      : prisma.satisfactionSurvey.groupBy({
          by: ['technicianId'],
          where: { technicianId: { in: technicianIds }, submittedAt: null },
          _count: { _all: true },
        }),
  ]);

  const accruedPendingByKey = new Map<string, number>();
  const accruedPaidByKey = new Map<string, number>();
  for (const row of commissionByProvider) {
    if (!row.providerId) continue;
    const key = `p:${row.providerId}`;
    if (row.status === 'PENDING') accruedPendingByKey.set(key, row._sum.amount ?? 0);
    else accruedPaidByKey.set(key, row._sum.amount ?? 0);
  }
  for (const row of commissionByTechnician) {
    if (!row.technicianId) continue;
    const key = `t:${row.technicianId}`;
    if (row.status === 'PENDING') accruedPendingByKey.set(key, row._sum.amount ?? 0);
    else accruedPaidByKey.set(key, row._sum.amount ?? 0);
  }

  const pendingSurveyByKey = new Map<string, number>();
  for (const row of pendingSurveyByProvider) {
    if (!row.providerId) continue;
    pendingSurveyByKey.set(`p:${row.providerId}`, row._count._all);
  }
  for (const row of pendingSurveyByTechnician) {
    if (!row.technicianId) continue;
    pendingSurveyByKey.set(`t:${row.technicianId}`, row._count._all);
  }

  const referees: ReferralOverviewReferee[] = [
    ...providers.map((p) => {
      const key = `p:${p.id}`;
      return {
        id: p.id,
        name: p.user.name,
        kind: 'PROVIDER' as const,
        approvalStatus: p.approvalStatus,
        joinedAt: p.appliedAt,
        accruedPending: accruedPendingByKey.get(key) ?? 0,
        accruedPaid: accruedPaidByKey.get(key) ?? 0,
        pendingSurveyCount: pendingSurveyByKey.get(key) ?? 0,
      };
    }),
    ...technicians.map((t) => {
      const key = `t:${t.id}`;
      return {
        id: t.id,
        name: t.user.name,
        kind: 'TECHNICIAN' as const,
        approvalStatus: t.approvalStatus,
        joinedAt: t.appliedAt,
        accruedPending: accruedPendingByKey.get(key) ?? 0,
        accruedPaid: accruedPaidByKey.get(key) ?? 0,
        pendingSurveyCount: pendingSurveyByKey.get(key) ?? 0,
      };
    }),
  ].sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());

  const totals = {
    refereeCount: referees.length,
    pendingSurveyCount: referees.reduce((sum, r) => sum + r.pendingSurveyCount, 0),
  };

  return { referees, totals };
}
