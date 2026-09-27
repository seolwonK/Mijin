import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsInspectionVisitBooked } from '@/lib/sms/templates';
import { adminVisitDateIssue, fromDateString, toDateString, todayKst } from '@/lib/inspection';

// 관리자의 대리 예약 — 방문이 아직 없는(또는 취소된) 회차에 날짜를 잡아 준다.
//
// 이 길이 없으면 고객이 분기 안에 예약하지 않은 회차는 **행 자체가 없어** 방문 PATCH
// (visits/[visitId])로는 손댈 수 없고, 고객 화면의 "보충 방문은 전화로 문의"가 지킬 수 없는
// 약속이 된다. 이미 일정이 잡힌 회차는 여기가 아니라 방문 일정의 '일정 변경'으로 옮긴다.

const bookSchema = z.object({
  quarter: z
    .number({ error: '회차를 확인해 주세요.' })
    .int('회차를 확인해 주세요.')
    .min(1, '회차는 1~4 중 하나여야 합니다.')
    .max(4, '회차는 1~4 중 하나여야 합니다.'),
  date: z.string().trim().min(1, '방문 날짜를 선택해 주세요.'),
  timeSlot: z.enum(['MORNING', 'AFTERNOON', 'ANY']),
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
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const { quarter, date, timeSlot } = parsed.data;

  const plan = await prisma.inspectionPlan.findUnique({
    where: { id },
    include: { visits: { where: { quarter } } },
  });
  if (!plan) {
    return NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 });
  }
  if (plan.status !== 'ACTIVE' || !plan.startDate || !plan.endDate) {
    return NextResponse.json(
      { error: '이용 중인 구독에만 방문을 잡을 수 있습니다.' },
      { status: 409 },
    );
  }
  const existing = plan.visits[0] ?? null;
  if (existing && existing.status !== 'CANCELED') {
    return NextResponse.json(
      { error: '이미 일정이 있는 회차입니다. 방문 일정에서 변경해 주세요.' },
      { status: 409 },
    );
  }

  const issue = adminVisitDateIssue({
    date,
    startDate: toDateString(plan.startDate),
    endDate: toDateString(plan.endDate),
    today: todayKst(),
  });
  if (issue) {
    return NextResponse.json({ error: `잡을 수 없는 날짜입니다. ${issue}` }, { status: 400 });
  }

  const fields = {
    preferredDate: fromDateString(date),
    timeSlot,
    status: 'SCHEDULED' as const,
    canceledAt: null,
  };
  // (planId, quarter) 유니크 — 고객이 같은 순간에 그 회차를 잡았다면 관리자 요청이 덮는다.
  // 전화로 합의한 날짜가 관리자 쪽에 있기 때문이다.
  await prisma.inspectionVisit.upsert({
    where: { planId_quarter: { planId: id, quarter } },
    create: { planId: id, quarter, ...fields },
    update: fields,
  });

  await sendSms(plan.contactPhone, smsInspectionVisitBooked({ quarter, date }));
  return NextResponse.json({ ok: true });
}
