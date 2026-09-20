import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsInspectionVisitBooked } from '@/lib/sms/templates';
import {
  type Quarter,
  fromDateString,
  toDateString,
  todayKst,
  visitDateIssue,
} from '@/lib/inspection';
import { expireDuePlans, PLAN_WITH_VISITS } from '@/lib/inspectionLifecycle';
import { buildPlanView } from '@/lib/inspectionView';

// 분기 방문 예약 — 신규 예약과 날짜 변경이 같은 입구를 쓴다((planId, quarter) 유니크).
// 날짜별 인원 한도가 없으므로(사용자 확정) 정원 검사가 없고, 고객이 고른 날짜는 즉시
// 방문 예정(SCHEDULED)으로 확정된다. 관리자 승인 단계를 두지 않는 것이 그 결정의 귀결이다.

const bookSchema = z.object({
  // 화면이 보내는 값이라 정상 사용에서는 틀릴 일이 없지만, 기본 zod 문구(영문)가 그대로
  // 사용자에게 보이는 것을 막으려고 한국어 메시지를 명시한다.
  quarter: z
    .number({ error: '회차를 확인해 주세요.' })
    .int('회차를 확인해 주세요.')
    .min(1, '회차는 1~4 중 하나여야 합니다.')
    .max(4, '회차는 1~4 중 하나여야 합니다.'),
  date: z.string().trim().min(1, '희망 날짜를 선택해 주세요'),
  timeSlot: z.enum(['MORNING', 'AFTERNOON', 'ANY']),
  note: z.string().trim().max(500).nullish(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession('CUSTOMER');
  if (!session) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const { quarter, date, timeSlot, note } = parsed.data;

  await expireDuePlans();

  const plan = await prisma.inspectionPlan.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    include: PLAN_WITH_VISITS,
  });
  if (!plan) {
    return NextResponse.json({ error: '점검 구독이 없습니다.' }, { status: 404 });
  }
  if (plan.status === 'PENDING_PAYMENT') {
    return NextResponse.json(
      { error: '입금이 확인된 뒤에 방문 날짜를 정할 수 있습니다.' },
      { status: 409 },
    );
  }
  // 만료·취소된 구독에 입금 안내를 내보내면 "입금했는데 왜 안 되냐"는 문의가 된다.
  // startDate 가 없는 ACTIVE 는 DB CHECK(InspectionPlan_term_matches_status)가 막지만,
  // 타입 좁히기를 위해 같은 분기에서 함께 처리한다.
  if (plan.status !== 'ACTIVE' || !plan.startDate) {
    return NextResponse.json(
      { error: '이용 기간이 끝난 구독입니다. 새로 신청해 주세요.' },
      { status: 409 },
    );
  }

  const issue = visitDateIssue({
    date,
    quarter: quarter as Quarter,
    startDate: toDateString(plan.startDate),
    today: todayKst(),
  });
  // 고정 머리말 + 구체 사유. 머리말이 있어야 이 400 이 스키마 위반 400(:44)과
  // 응답만으로 구별된다(gate-map 의 모호성 검사 — false-green 방지).
  if (issue) {
    return NextResponse.json(
      { error: `예약할 수 없는 날짜입니다. ${issue}` },
      { status: 400 },
    );
  }

  const existing = plan.visits.find((v) => v.quarter === quarter);
  if (existing?.status === 'COMPLETED') {
    return NextResponse.json(
      { error: '이미 점검이 완료된 회차입니다.' },
      { status: 409 },
    );
  }

  await prisma.inspectionVisit.upsert({
    where: { planId_quarter: { planId: plan.id, quarter } },
    create: {
      planId: plan.id,
      quarter,
      preferredDate: fromDateString(date),
      timeSlot,
      note: note || null,
      status: 'SCHEDULED',
    },
    update: {
      preferredDate: fromDateString(date),
      timeSlot,
      note: note || null,
      status: 'SCHEDULED',
      // 재예약이면 이전 취소 흔적을 지운다 — 상태와 타임스탬프가 어긋나지 않게.
      canceledAt: null,
    },
  });

  await sendSms(plan.contactPhone, smsInspectionVisitBooked({ quarter, date }));

  const updated = await prisma.inspectionPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: PLAN_WITH_VISITS,
  });
  return NextResponse.json({ ok: true, plan: buildPlanView(updated) });
}
