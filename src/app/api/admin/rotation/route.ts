import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getCandidates } from '@/lib/matching';
import { isValidRegionKey, regionKey } from '@/lib/regions';

// 지역 순환 현황(AC-2) — Option C: 합성 NORMAL 요청으로 matching.ts의 getCandidates()를
// 그대로 재사용한다(랭킹 로직 0줄 복제, matching.ts 0줄 수정). 결정 근거는
// .omc/research/assign-viz/decision-candidates-reuse.md 참조.
// URGENT·NORMAL은 완전히 동일한 사슬을 타므로 NORMAL 1회 호출로 두 긴급도를 공용 표현한다
// (CRITICAL은 거리 우선이라 이 보드의 순번이 적용되지 않는다 — meta.criticalNotApplied).
export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sido = searchParams.get('sido')?.trim() ?? '';
  const sigungu = searchParams.get('sigungu')?.trim() ?? '';
  if (!sido) {
    return NextResponse.json({ error: '시/도를 선택해 주세요' }, { status: 400 });
  }

  const key = regionKey(sido, sigungu);
  if (!isValidRegionKey(key)) {
    return NextResponse.json({ error: '올바르지 않은 지역입니다' }, { status: 400 });
  }

  const synthetic = {
    id: 'rotation-board-synthetic',
    lat: null,
    lng: null,
    address: key,
    urgency: 'NORMAL' as const,
  };
  const candidates = (await getCandidates(synthetic, { withStats: true })).filter(
    (c) => c.coversRegion,
  );

  return NextResponse.json({
    candidates: candidates.map((c) => ({
      name: c.name,
      kind: c.kind,
      assigned30d: c.assigned30d,
      avgRating: c.avgRating,
      reviewCount: c.reviewCount,
    })),
    meta: {
      chainLabel: 'URGENT·NORMAL 공통 사슬',
      criticalNotApplied: true,
      distanceTieUnresolved: true,
    },
  });
}
