import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

// 관리자 직접 처리 완료 — 단독 운영(업체 없이 관리자가 전화로 처리)에서 배정 대기 접수가 쌓이지 않게
// 목록에서 바로 닫는다. 배정 전(RECEIVED) 접수만 받는다: 업체가 낀 접수(ASSIGNED 이후)를 여기서 닫으면
// 업체 통지·만족도 조사·추천 수수료·알 차감 기록이 어긋나므로, 그런 건은 업체 완료나 상세 화면의 회수·취소로 처리한다.
// 담당자가 없으니 만족도 조사 문자도 보내지 않는다. claimAndAssign 과 같은 접수 행 CAS 라 동시 배정과는 한쪽만 이긴다.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const updated = await prisma.serviceRequest.updateMany({
    where: { id, status: 'RECEIVED' },
    data: { status: 'COMPLETED', completedAt: new Date(), needsAttention: false },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: '배정 대기 상태의 접수만 바로 완료할 수 있습니다' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
