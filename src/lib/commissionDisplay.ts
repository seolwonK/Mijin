import { prisma } from '@/lib/db';

export type RefereeInfo = { name: string; type: '업체' | '기술자' };

// CommissionEntry의 피소개자 표시용 키 — providerId/technicianId는 XOR이라 항상 하나만 존재한다.
// rankingStats.ts의 p:/t: 접두 관례를 그대로 따른다.
export function refereeKey(e: { providerId: string | null; technicianId: string | null }): string {
  return e.providerId ? `p:${e.providerId}` : `t:${e.technicianId}`;
}

// CommissionEntry 목록의 providerId/technicianId(반정규화 스냅샷)로 피소개자 이름을 배치 조회한다.
// 관리자 정산·본인 조회 화면이 공유 — 건별로 개별 조회하면 N+1이 되므로 목록 전체에서 id를 모아
// Provider/Technician 각 1쿼리로 이름을 가져온다(rankingStats.getRankingStats와 동형 패턴).
export async function resolveRefereeNames(
  entries: { providerId: string | null; technicianId: string | null }[],
): Promise<Map<string, RefereeInfo>> {
  const providerIds = [
    ...new Set(entries.map((e) => e.providerId).filter((v): v is string => v != null)),
  ];
  const technicianIds = [
    ...new Set(entries.map((e) => e.technicianId).filter((v): v is string => v != null)),
  ];
  const map = new Map<string, RefereeInfo>();
  if (providerIds.length === 0 && technicianIds.length === 0) return map;

  const [providers, technicians] = await Promise.all([
    providerIds.length === 0
      ? []
      : prisma.provider.findMany({
          where: { id: { in: providerIds } },
          select: { id: true, user: { select: { name: true } } },
        }),
    technicianIds.length === 0
      ? []
      : prisma.technician.findMany({
          where: { id: { in: technicianIds } },
          select: { id: true, user: { select: { name: true } } },
        }),
  ]);
  for (const p of providers) map.set(`p:${p.id}`, { name: p.user.name, type: '업체' });
  for (const t of technicians) map.set(`t:${t.id}`, { name: t.user.name, type: '기술자' });
  return map;
}
