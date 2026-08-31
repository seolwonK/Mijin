import { prisma } from '@/lib/db';
import { haversineKm } from '@/lib/geo/distance';
import { coversRegion, regionFromAddress, type Region } from '@/lib/regions';
import type { AssigneeKind } from '@/lib/assignee';
import { assigneeKey } from '@/lib/assignee';
import { getRankingStats } from '@/lib/rankingStats';
import type { Urgency } from '@prisma/client';

export type Candidate = {
  kind: AssigneeKind; // 업체(PROVIDER) / 전기기사(TECHNICIAN)
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
  eggBalance: number; // 알 크레딧 — 유료 상위노출 (진실원장 EggLedger, 캐시 필드)
  sameDistrict: boolean; // 후보 소재지가 접수지와 같은 시/군/구 — CRITICAL 전용 티어
};

// 초긴급 "같은 지역" 동급 판정 — 후보 소재지 주소 기반(좌표 불필요).
// 접수지의 시/군/구가 판별돼야만(true 가능) 하고, 후보 주소도 시/군/구까지 정확히
// 일치해야 한다. 판별 불가·모호(sigungu='')는 무조건 false — "모호한 주소가
// 정확한 주소를 이기는" 역전을 차단한다(플랜 v2 Finding H).
export function isSameDistrict(reqRegion: Region | null, candAddress: string): boolean {
  if (reqRegion === null || reqRegion.sigungu === '') return false;
  const cand = regionFromAddress(candAddress);
  return cand !== null && cand.sido === reqRegion.sido && cand.sigungu === reqRegion.sigungu;
}

// 정렬 순서 (알 크레딧 통합 — ralplan-egg-credit.md B-2):
// non-CRITICAL(일반·긴급): ①거절이력 없음 ②지역 커버 ③알 보유량 desc(유료 상위노출)
//   ④30일 배정 횟수 asc(순환 — 알 동률 그룹 내에서만 작동) ⑤평균 별점 desc
//   ⑥거리 asc(null 후순위) ⑦안정 키(`kind:id`) asc
// CRITICAL(초긴급): ①거절이력 없음 ②지역 커버 ③같은 시/군/구 우선(소재지 주소 기반)
//   ④알 보유량 desc(동일 sameDistrict 값끼리) ⑤거리 asc(null 후순위) ⑥안정 키
//   — 순환·별점은 건너뛰어 속도 우선 원칙 유지, 알은 지역 동급 내 타이브레이크로만.
// ⚠️ 이 사슬을 바꾸면 candidateRankingDisplay.ts(deriveRankingBadge)도 함께 갱신할 것.
export function compareCandidates(
  urgency: Urgency,
): (a: Candidate, b: Candidate) => number {
  return (a, b) => {
    if (a.rejectedThisRequest !== b.rejectedThisRequest) return a.rejectedThisRequest ? 1 : -1; // ①
    if (a.coversRegion !== b.coversRegion) return a.coversRegion ? -1 : 1;                      // ②
    if (urgency === 'CRITICAL') {
      if (a.sameDistrict !== b.sameDistrict) return a.sameDistrict ? -1 : 1;                    // ③ 같은구 우선
      if (a.eggBalance !== b.eggBalance) return b.eggBalance - a.eggBalance;                    // ④ 알 (동급 내)
    } else {
      if (a.eggBalance !== b.eggBalance) return b.eggBalance - a.eggBalance;                    // ③ 알 (유료 상위노출)
      if (a.assigned30d !== b.assigned30d) return a.assigned30d - b.assigned30d;                 // ④ 순환
      if (a.avgRating !== b.avgRating) return b.avgRating - a.avgRating;                         // ⑤ 리뷰
    }
    if (a.distanceKm != null || b.distanceKm != null) {                                          // 거리 — 현행 null 규칙
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;                                            // 안정 키 (localeCompare 금지 — 로케일 의존 결정성 훼손)
  };
}

// 승인(APPROVED)된 활성 업체·전기기사를 정렬해 반환.
// 정렬 순서는 compareCandidates 참조(urgency는 필수 필드 — 관리자 후보 route처럼
// select 누락 시 CRITICAL 오정렬이 런타임이 아닌 컴파일 에러로 잡히도록 한다).
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
    // 전기기사는 근로확인서 서명 완료(CONFIRMED) 후에만 배정 대상이 된다
    prisma.technician.findMany({
      where: {
        isActive: true,
        approvalStatus: 'APPROVED',
        contract: { status: 'CONFIRMED' },
      },
      include: { user: { select: { name: true, phone: true } } },
    }),
    // 거절(REJECTED) + 무응답 자동 회수(EXPIRED) + 관리자 수동 회수(CANCELED) 모두
    // 이 접수의 최후순위 티어 — 응답하지 않았거나 관리자가 걷어간 대상에게 자동배정이
    // 곧바로 같은 건을 다시 주는 루프를 막는다. 특정 대상에게 다시 주고 싶으면
    // 관리자 수동 배정으로는 언제든 가능하다.
    prisma.assignment.findMany({
      where: { requestId: request.id, status: { in: ['REJECTED', 'EXPIRED', 'CANCELED'] } },
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
      eggBalance: p.eggBalance,
      sameDistrict: isSameDistrict(reqRegion, p.address),
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
      eggBalance: t.eggBalance,
      sameDistrict: isSameDistrict(reqRegion, t.address),
      ...statsFor('TECHNICIAN', t.id),
    })),
  ];

  candidates.sort(compareCandidates(request.urgency));
  return candidates;
}
