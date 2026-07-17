import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getReferralOverview } from '@/lib/referralOverview';

// 본인(소개자) 조회 — referrerUserId는 소개자의 User.id이므로 세션 userId와 그대로 대응
// (commissions/stats route와 동일 인증 패턴, id 파라미터 없음).
export async function GET() {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const overview = await getReferralOverview(session.userId);
  return NextResponse.json(overview);
}
