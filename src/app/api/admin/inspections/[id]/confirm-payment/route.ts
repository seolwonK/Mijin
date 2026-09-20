import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { sendSms } from '@/lib/sms';
import { smsInspectionActivated } from '@/lib/sms/templates';
import { toDateString } from '@/lib/inspection';
import { activatePlan } from '@/lib/inspectionLifecycle';
import { buildPlanView } from '@/lib/inspectionView';

// 입금 확인 → 구독 활성화. 확인한 날이 구독 시작일이고, 거기서 분기 4구간이 파생된다.
// 전이·CAS·1분기 확정 규칙은 lib/inspectionLifecycle.ts 가 소유한다(라우트는 얇게).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { id } = await params;

  const result = await activatePlan(id, session.userId);
  if (!result.ok) {
    return result.reason === 'NOT_FOUND'
      ? NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 })
      : NextResponse.json(
          { error: '이미 처리된 구독입니다. 화면을 새로고침해 주세요.' },
          { status: 409 },
        );
  }

  const { plan, firstVisitDate } = result;
  await sendSms(
    plan.contactPhone,
    smsInspectionActivated({
      customerName: plan.contactName,
      endDate: plan.endDate ? toDateString(plan.endDate) : '',
      firstVisitDate,
    }),
  );

  return NextResponse.json({ ok: true, plan: buildPlanView(plan) });
}
