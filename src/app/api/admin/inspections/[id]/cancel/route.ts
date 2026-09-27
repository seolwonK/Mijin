import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { COMPANY } from '@/lib/company';
import { sendSms } from '@/lib/sms';
import { smsInspectionPlanCanceled } from '@/lib/sms/templates';
import { cancelPlan } from '@/lib/inspectionLifecycle';
import { buildPlanView } from '@/lib/inspectionView';

// 구독 취소 — 오입금·환불·고객 요청. 사유는 필수다(나중에 "왜 취소했더라"가 남지 않게).
// 전이·CAS·딸린 방문 취소는 lib/inspectionLifecycle.ts 가 소유한다(라우트는 얇게).

const cancelSchema = z.object({
  reason: z
    .string({ error: '취소 사유를 입력해 주세요' })
    .trim()
    .min(1, '취소 사유를 입력해 주세요')
    .max(200, '취소 사유는 200자 이내로 입력해 주세요'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }

  const result = await cancelPlan(id, parsed.data.reason);
  if (!result.ok) {
    return result.reason === 'NOT_FOUND'
      ? NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 })
      : NextResponse.json(
          { error: '이미 종료된 구독입니다. 화면을 새로고침해 주세요.' },
          { status: 409 },
        );
  }

  // 사유는 고객 화면(/my)에 그대로 보이므로 문자에는 싣지 않는다 — 단문(SMS) 요금에 맞춘다.
  const { plan } = result;
  await sendSms(
    plan.contactPhone,
    smsInspectionPlanCanceled({ customerName: plan.contactName, tel: COMPANY.tel }),
  );

  return NextResponse.json({ ok: true, plan: buildPlanView(plan, 'admin') });
}
