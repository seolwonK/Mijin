import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getMyEggRank } from '@/lib/eggs';

// 본인 알 잔액·순위 — 같은 종류(기사) 내 배정 자격자 풀 기준. 타인 정보는 반환하지 않는다.
export async function GET() {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const rank = await getMyEggRank({ kind: 'TECHNICIAN', id: session.technicianId });
  if (!rank) {
    return NextResponse.json({ error: '프로필을 찾을 수 없습니다' }, { status: 404 });
  }
  return NextResponse.json(rank); // { balance, rank, poolSize }
}
