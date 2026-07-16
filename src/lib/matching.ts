import { prisma } from '@/lib/db';
import { haversineKm } from '@/lib/geo/distance';
import { coversRegion, regionFromAddress } from '@/lib/regions';
import type { AssigneeKind } from '@/lib/assignee';
import { assigneeKey } from '@/lib/assignee';
import { getRankingStats } from '@/lib/rankingStats';
import type { Urgency } from '@prisma/client';

export type Candidate = {
  kind: AssigneeKind; // 업체(PROVIDER) / 개인기술자(TECHNICIAN)
  id: string; // provider.id 또는 technician.id
  key: string; // `${kind}:${id}` — 안정 정렬 최종 타이브레이크용
  name: string;
  phone: string;
  address: string;
  regions: string[]; // 서비스 가능 지역 (빈 배열 = 전 지역)
  isActive: boolean;
  distanceKm: number | null;
  coversRegion: boolean; // 이 접수의 지역을 담당하는지 (담당 안 하면 후순위)
  rejectedThisRequest: boolean;
  assigned30d: number; // 최근 30일 배정 횟수(수락+거절 합산 — 순환 배정 타이브레이크)
  avgRating: number; // 리뷰 평균 별점 (0건 = 3.0)
  reviewCount: number;
};

// 승인(APPROVED)된 활성 업체·기술자를 정렬해 반환.
// 정렬 순서: ①거절이력 없음 ②지역 커버 ③(non-CRITICAL) 30일 배정 횟수(수락+거절) asc
// ④(non-CRITICAL) 평균 별점 desc ⑤거리 asc ⑥안정 키(`kind:id`) asc.
// urgency는 필수 필드 — 관리자 후보 route처럼 select 누락 시 CRITICAL 오정렬이
// 런타임이 아닌 컴파일 에러로 잡히도록 한다.
// opts.withStats: CRITICAL 접수에서도 표시용 통계가 필요한 호출부(관리자 후보 목록)용.
// CRITICAL이면서 withStats가 없으면 getRankingStats 자체를 생략(집계 비용 0).
export async function getCandidates(
  request: {
    id: string;
    lat: number | null;
    lng: number | null;
    address: string | null;
    urgency: Urgency;
  },
  opts?: { withStats?: boolean },
): Promise<Candidate[]> {
  const reqRegion = regionFromAddress(request.address);
  const [providers, technicians, rejectedRows] = await Promise.all([
    prisma.provider.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      include: { user: { select: { name: true, phone: true } } },
    }),
    // 기술자는 근로계약서 서명 완료(CONFIRMED) 후에만 배정 대상이 된다
    prisma.technician.findMany({
      where: {
        isActive: true,
        approvalStatus: 'APPROVED',
        contract: { status: 'CONFIRMED' },
      },
      include: { user: { select: { name: true, phone: true } } },
    }),
    prisma.assignment.findMany({
      where: { requestId: request.id, status: 'REJECTED' },
      select: { providerId: true, technicianId: true },
    }),
  ]);

  const rejected = new Set<string>();
  for (const r of rejectedRows) {
    const key = assigneeKey(r);
    if (key) rejected.add(key);
  }

  const distanceTo = (lat: number | null, lng: number | null): number | null =>
    request.lat != null && request.lng != null && lat != null && lng != null
      ? haversineKm(request.lat, request.lng, lat, lng)
      : null;

  // CRITICAL은 ③④를 건너뛰므로 withStats 요청이 없는 한 집계 쿼리 자체를 생략한다.
  const needsStats = request.urgency !== 'CRITICAL' || opts?.withStats;
  const rankingStats = needsStats
    ? await getRankingStats(
        providers.map((p) => p.id),
        technicians.map((t) => t.id),
      )
    : null;
  const DEFAULT_STATS = { assigned30d: 0, avgRating: 3.0, reviewCount: 0 };
  const statsFor = (kind: AssigneeKind, id: string) =>
    rankingStats?.get(`${kind === 'PROVIDER' ? 'p' : 't'}:${id}`) ?? DEFAULT_STATS;

  const candidates: Candidate[] = [
    ...providers.map((p) => ({
      kind: 'PROVIDER' as const,
      id: p.id,
      key: `PROVIDER:${p.id}`,
      name: p.user.name,
      phone: p.user.phone,
      address: p.address,
      regions: p.regions,
      isActive: p.isActive,
      distanceKm: distanceTo(p.lat, p.lng),
      coversRegion: coversRegion(p.regions, reqRegion),
      rejectedThisRequest: rejected.has(`PROVIDER:${p.id}`),
      ...statsFor('PROVIDER', p.id),
    })),
    ...technicians.map((t) => ({
      kind: 'TECHNICIAN' as const,
      id: t.id,
      key: `TECHNICIAN:${t.id}`,
      name: t.user.name,
      phone: t.user.phone,
      address: t.address,
      regions: t.regions,
      isActive: t.isActive,
      distanceKm: distanceTo(t.lat, t.lng),
      coversRegion: coversRegion(t.regions, reqRegion),
      rejectedThisRequest: rejected.has(`TECHNICIAN:${t.id}`),
      ...statsFor('TECHNICIAN', t.id),
    })),
  ];

  candidates.sort((a, b) => {
    if (a.rejectedThisRequest !== b.rejectedThisRequest) return a.rejectedThisRequest ? 1 : -1; // ① 현행
    if (a.coversRegion !== b.coversRegion) return a.coversRegion ? -1 : 1;                      // ② 현행
    if (request.urgency !== 'CRITICAL') {
      if (a.assigned30d !== b.assigned30d) return a.assigned30d - b.assigned30d;                 // ③ 순환
      if (a.avgRating !== b.avgRating) return b.avgRating - a.avgRating;                         // ④ 리뷰
    }
    if (a.distanceKm != null || b.distanceKm != null) {                                          // ⑤ 거리 — 현행 null 규칙
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;                                            // ⑥ 안정 키 (localeCompare 금지 — 로케일 의존 결정성 훼손)
  });
  return candidates;
}
