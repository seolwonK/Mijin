import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { regionKey } from '@/lib/regions';

export type AreaPartnerStats = { providers: number; technicians: number };

// 특정 시/군/구를 담당 지역으로 등록한(또는 시/도 전체·전 지역을 담당하는) 승인·활성 파트너 수.
// coversRegion(src/lib/regions.ts)과 같은 판정: regions 가 비어 있으면 전 지역, 시/도 키면 그 시/도 전체.
// 지역 페이지에 "그 지역이 아니면 거짓이 되는 숫자"를 넣기 위한 실데이터(도어웨이 판정 회피, local.md).
async function fetchAreaPartnerStats(sido: string, sigungu: string): Promise<AreaPartnerStats> {
  const where = {
    approvalStatus: 'APPROVED' as const,
    isActive: true,
    OR: [{ regions: { isEmpty: true } }, { regions: { hasSome: [sido, regionKey(sido, sigungu)] } }],
  };
  const [providers, technicians] = await Promise.all([
    prisma.provider.count({ where }),
    prisma.technician.count({ where }),
  ]);
  return { providers, technicians };
}

// 홈 리뷰 집계(landingReviews.ts)와 같은 캐시 정책 — 최대 1시간 지연.
export const getAreaPartnerStats = unstable_cache(fetchAreaPartnerStats, ['area-partner-stats'], {
  revalidate: 3600,
});
