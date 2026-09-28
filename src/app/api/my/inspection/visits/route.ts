import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsInspectionVisitBooked } from '@/lib/sms/templates';
import {
  BOOKING_BLOCK_MESSAGE,
  bookingBlock,
  freeRound,
  fromDateString,
  occupiesRound,
  toDateString,
  todayKst,
  visitDateIssue,
  yearOfDate,
} from '@/lib/inspection';
import { expireDuePlans, PLAN_WITH_VISITS } from '@/lib/inspectionLifecycle';
import { buildPlanView } from '@/lib/inspectionView';

// 점검 예약 — 신규 예약(visitId 없음)과 기존 회차의 날짜 변경(visitId)이 같은 입구를 쓴다.
// 1년에 12회를 이용 연차 안에서 자유롭게 쓰므로(사용자 결정 2026-09-28) 신규 예약은 고른
// 날짜의 연차에서 비어 있는 가장 작은 회차 번호를 차지한다. 날짜별 인원 한도가 없어 정원
// 검사가 없고, 고객이 고른 날짜는 즉시 점검 예정(SCHEDULED)으로 확정된다. 점검 방식은 고객이
// 고르지 않는다 — 새 회차는 전화 점검이고, 방문 여부는 관리자가 판단한다.

// 인메모리 레이트리밋: 계정당 10분에 10회. 날짜를 바꿀 때마다 과금되는 문자가 나가고 그 번호는
// 신청서에 적은 값일 뿐 본인 확인을 거치지 않았으므로, 제한이 없으면 남의 번호로 문자를 무한히
// 쏘는 길이 된다. 세션이 있는 경로라 IP 가 아니라 위조할 수 없는 userId 를 키로 쓴다.
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(userId);
  if (!h || h.resetAt < now) {
    hits.set(userId, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  h.count++;
  return h.count > 10;
}

const bookSchema = z.object({
  // 화면이 보내는 값이라 정상 사용에서는 틀릴 일이 없지만, 기본 zod 문구(영문)가 그대로
  // 사용자에게 보이는 것을 막으려고 한국어 메시지를 명시한다.
  // 날짜를 바꿀 기존 회차. 없으면 새 점검을 잡는다.
  visitId: z.string({ error: '회차를 확인해 주세요.' }).trim().min(1, '회차를 확인해 주세요.').nullish(),
  date: z.string().trim().min(1, '희망 날짜를 선택해 주세요'),
  timeSlot: z.enum(['MORNING', 'AFTERNOON', 'ANY']),
  note: z.string().trim().max(500).nullish(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession('CUSTOMER');
  if (!session) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  if (rateLimited(session.userId)) {
    return NextResponse.json(
      { error: '변경이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
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
  const { visitId, date, timeSlot, note } = parsed.data;

  await expireDuePlans({ userId: session.userId });

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

  const startDate = toDateString(plan.startDate);
  const today = todayKst();
  const existing = visitId ? (plan.visits.find((v) => v.id === visitId) ?? null) : null;
  if (visitId && !existing) {
    return NextResponse.json({ error: '점검 일정을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 회차 자체가 잠겨 있는지부터 본다(완료·임박·기간 경과) — 화면의 "날짜 변경" 버튼을
  // 숨기는 것과 같은 함수라 둘이 어긋나지 않는다. 잠긴 회차에 날짜 오류를 먼저 돌려주면
  // 고객은 날짜만 바꿔 가며 헛되이 다시 시도하게 된다.
  if (existing) {
    const block = bookingBlock({
      startDate,
      round: existing.round,
      today,
      visit: { date: toDateString(existing.preferredDate), status: existing.status },
    });
    if (block) {
      return NextResponse.json({ error: BOOKING_BLOCK_MESSAGE[block] }, { status: 409 });
    }
  }

  const issue = visitDateIssue({
    date,
    startDate,
    termMonths: plan.termMonths,
    today,
    round: existing?.round ?? null,
  });
  // 고정 머리말 + 구체 사유. 머리말이 있어야 이 400 이 스키마 위반 400 과
  // 응답만으로 구별된다(gate-map 의 모호성 검사 — false-green 방지).
  if (issue) {
    return NextResponse.json(
      { error: `예약할 수 없는 날짜입니다. ${issue}` },
      { status: 400 },
    );
  }

  // 같은 날 두 번 잡지 않는다 — 하루에 두 통의 점검 전화는 한 번과 다르지 않고 횟수만 줄어든다.
  const clash = plan.visits.find(
    (v) =>
      v.id !== existing?.id &&
      occupiesRound(v.status) &&
      toDateString(v.preferredDate) === date,
  );
  if (clash) {
    return NextResponse.json(
      { error: '그날은 이미 점검이 잡혀 있습니다. 다른 날짜를 골라 주세요.' },
      { status: 409 },
    );
  }

  const preferredDate = fromDateString(date);
  let round: number;
  let method: 'PHONE' | 'ONSITE';
  let unchanged = false;

  if (existing) {
    round = existing.round;
    method = existing.method;
    unchanged =
      existing.status === 'SCHEDULED' &&
      existing.preferredDate.getTime() === preferredDate.getTime() &&
      existing.timeSlot === timeSlot;
    // CAS — 읽고 쓰는 사이에 관리자가 완료 처리했다면 그 기록을 덮어쓰지 않는다.
    const saved = await prisma.inspectionVisit.updateMany({
      where: { id: existing.id, status: existing.status },
      data: {
        preferredDate,
        timeSlot,
        note: note || null,
        status: 'SCHEDULED',
        // 재예약이면 이전 취소 흔적을 지운다 — 상태와 타임스탬프가 어긋나지 않게.
        canceledAt: null,
      },
    });
    if (saved.count === 0) {
      return NextResponse.json(
        { error: '방금 일정 상태가 바뀌었습니다. 화면을 새로고침해 주세요.' },
        { status: 409 },
      );
    }
  } else {
    // visitDateIssue 가 이용 기간 안임을 보장했으므로 연차는 반드시 있다.
    const year = yearOfDate(startDate, plan.termMonths, date)!;
    const free = freeRound(
      plan.visits.map((v) => ({ round: v.round, status: v.status })),
      year,
    );
    if (free == null) {
      return NextResponse.json(
        { error: `${year}년차 점검 12회를 모두 잡으셨습니다.` },
        { status: 409 },
      );
    }
    round = free;
    method = 'PHONE';
    const fields = {
      preferredDate,
      timeSlot,
      note: note || null,
      method,
      status: 'SCHEDULED' as const,
      canceledAt: null,
      completedAt: null,
      adminMemo: null,
    };
    // 비어 있던 회차면 새로 만들고, 취소된 회차면 그 행을 새 점검으로 되살린다.
    // CAS — 두 탭에서 동시에 잡아 같은 번호를 노린 경우 나중 요청은 여기서 떨어진다.
    const reused = await prisma.inspectionVisit.updateMany({
      where: { planId: plan.id, round, status: 'CANCELED' },
      data: fields,
    });
    if (reused.count === 0) {
      try {
        await prisma.inspectionVisit.create({ data: { planId: plan.id, round, ...fields } });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        return NextResponse.json(
          { error: '방금 일정 상태가 바뀌었습니다. 화면을 새로고침해 주세요.' },
          { status: 409 },
        );
      }
    }
  }

  // 요청사항만 고쳤거나 같은 값으로 다시 저장한 경우에는 문자를 보내지 않는다 —
  // 저장 버튼을 누를 때마다 과금되는 문자가 나가면 안 된다.
  if (!unchanged) {
    await sendSms(plan.contactPhone, smsInspectionVisitBooked({ round, date, method }));
  }

  const updated = await prisma.inspectionPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: PLAN_WITH_VISITS,
  });
  return NextResponse.json({ ok: true, plan: buildPlanView(updated, 'customer') });
}
