import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getPortalPerformanceStats } from '@/lib/portalStats';

// 업체 본인 성과 통계(AC-3) — 인증 패턴은 partner/jobs/route.ts:5-9와 동일(세션 주체 도출,
// id 파라미터 없음 — 구조적으로 타 주체 접근 불가).
export async function GET() {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const stats = await getPortalPerformanceStats({ kind: 'PROVIDER', id: session.providerId });
  return NextResponse.json(stats);
}
