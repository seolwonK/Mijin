import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsInspectionVisitBooked } from '@/lib/sms/templates';
import {
  adminVisitDateIssue,
  freeRound,
  fromDateString,
  occupiesRound,
  toDateString,
  todayKst,
  yearOfDate,
} from '@/lib/inspection';

// 관리자의 대리 예약 — 고객이 전화로 요청한 점검을 대신 잡아 주거나, 전화 점검 결과 방문이
// 필요해 따로 방문 일정을 잡는 경우다. 고른 날짜의 이용 연차에서 비어 있는(또는 취소된) 가장
// 작은 회차를 차지한다 — 고객 예약과 같은 12회 몫을 쓴다. 이미 잡힌 회차는 여기가 아니라
// 점검 일정의 '일정 변경'으로 옮긴다.

const bookSchema = z.object({
  date: z.string().trim().min(1, '점검 날짜를 선택해 주세요.'),
  timeSlot: z.enum(['MORNING', 'AFTERNOON', 'ANY']),
  method: z.enum(['PHONE', 'ONSITE']).default('PHONE'),
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
  const { date, timeSlot, method } = parsed.data;

  const plan = await prisma.inspectionPlan.findUnique({
    where: { id },
    include: { visits: { select: { round: true, status: true, preferredDate: true } } },
  });
  if (!plan) {
    return NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 });
  }
  if (plan.status !== 'ACTIVE' || !plan.startDate || !plan.endDate) {
    return NextResponse.json(
      { error: '이용 중인 구독에만 점검을 잡을 수 있습니다.' },
      { status: 409 },
    );
  }
  const startDate = toDateString(plan.startDate);

  const issue = adminVisitDateIssue({
    date,
    startDate,
    endDate: toDateString(plan.endDate),
    today: todayKst(),
  });
  if (issue) {
    return NextResponse.json({ error: `잡을 수 없는 날짜입니다. ${issue}` }, { status: 400 });
  }
  if (
    plan.visits.some(
      (v) => occupiesRound(v.status) && toDateString(v.preferredDate) === date,
    )
  ) {
    return NextResponse.json(
      { error: '그날은 이미 점검이 잡혀 있습니다. 점검 일정에서 방식이나 날짜를 바꿔 주세요.' },
      { status: 409 },
    );
  }

  const year = yearOfDate(startDate, plan.termMonths, date)!;
  const round = freeRound(plan.visits, year);
  if (round == null) {
    return NextResponse.json(
      { error: `${year}년차 점검 12회를 모두 사용한 구독입니다.` },
      { status: 409 },
    );
  }

  const fields = {
    preferredDate: fromDateString(date),
    timeSlot,
    method,
    status: 'SCHEDULED' as const,
    canceledAt: null,
    completedAt: null,
    // 취소된 회차를 다시 쓰는 경우 이전 점검의 요청사항·메모가 새 점검에 붙지 않게 비운다.
    note: null,
    adminMemo: null,
  };
  // (planId, round) 유니크 — 고객이 같은 순간에 그 회차를 잡았다면 관리자 요청이 덮는다.
  // 전화로 합의한 날짜가 관리자 쪽에 있기 때문이다.
  await prisma.inspectionVisit.upsert({
    where: { planId_round: { planId: id, round } },
    create: { planId: id, round, ...fields },
    update: fields,
  });

  await sendSms(plan.contactPhone, smsInspectionVisitBooked({ round, date, method }));
  return NextResponse.json({ ok: true, round });
}
