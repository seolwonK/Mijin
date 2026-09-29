import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import {
  smsInspectionVisitBooked,
  smsInspectionVisitCanceled,
  smsInspectionVisitRescheduled,
  smsInspectionSwitchedToOnsite,
} from '@/lib/sms/templates';
import {
  adminVisitDateIssue,
  canTransitionVisit,
  fromDateString,
  occupiesRound,
  toDateString,
  todayKst,
} from '@/lib/inspection';
import { inspectionPortalUrl } from '@/lib/inspectionLifecycle';

// 점검 1건의 관리자 갱신 — 완료·취소·되돌리기, 대리 일정 변경, 점검 방식(전화↔방문), 담당자 메모.
//
// 점검 방식(method)은 플랫폼의 판단이다(사용자 결정 2026-09-28): 전화 점검을 해 보고 방문이
// 필요하면 관리자가 ONSITE 로 돌린다 — 이때 날짜·시간대를 같은 요청으로 방문일로 옮길 수 있다.
//
// adminMemo 가 "누가 갔는지"를 적는 칸이다: 기사 배정을 시스템이 하지 않기로 했으므로
// (사용자 결정 2026-09-20) 방문 담당자는 구조화된 FK 가 아니라 자유 메모로 남는다.
//
// 대리 일정 변경(date)은 전화로 요청받은 변경을 처리하는 길이다. 고객 화면이 임박한 방문이나
// 기간이 지난 회차에 "고객센터로 문의"를 안내하므로, 문의를 받은 쪽에 도구가 있어야 한다.

const patchSchema = z
  .object({
    status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELED']).optional(),
    adminMemo: z.string().trim().max(300).nullish(),
    date: z.string().trim().optional(),
    timeSlot: z.enum(['MORNING', 'AFTERNOON', 'ANY']).optional(),
    method: z.enum(['PHONE', 'ONSITE']).optional(),
    // 점검 결과 — 완료된(또는 이 요청으로 완료되는) 회차에만. 고객 화면에도 보인다.
    result: z.enum(['NORMAL', 'CAUTION', 'NEEDS_VISIT']).nullish(),
    resultNote: z.string().trim().max(500, '결과 설명은 500자 이내로 입력해 주세요').nullish(),
  })
  .refine(
    (v) => v.date === undefined || v.status === undefined || v.status === 'SCHEDULED',
    '일정 변경과 완료·취소 처리는 따로 해 주세요.',
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { visitId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const { adminMemo, date, timeSlot, method, result, resultNote } = parsed.data;
  if (
    parsed.data.status === undefined &&
    adminMemo === undefined &&
    date === undefined &&
    timeSlot === undefined &&
    method === undefined &&
    result === undefined &&
    resultNote === undefined
  ) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
  }

  const visit = await prisma.inspectionVisit.findUnique({
    where: { id: visitId },
    include: {
      plan: {
        select: {
          status: true,
          startDate: true,
          endDate: true,
          contactPhone: true,
          visits: { select: { id: true, status: true, preferredDate: true } },
        },
      },
    },
  });
  if (!visit) {
    return NextResponse.json({ error: '방문 일정을 찾을 수 없습니다' }, { status: 404 });
  }

  // 일정을 옮기면 그 방문은 다시 예정 상태가 된다(취소됐던 방문을 새 날짜로 살리는 경우 포함).
  const nextStatus = date !== undefined ? 'SCHEDULED' : parsed.data.status;
  const statusChanges = nextStatus !== undefined && nextStatus !== visit.status;
  // 담당 메모만 고치는 요청인가, 일정·상태를 움직이는 요청인가 — 아래의 게이트와 CAS 가 함께 쓴다.
  const methodChanges = method !== undefined && method !== visit.method;
  const touchesSchedule =
    statusChanges || date !== undefined || timeSlot !== undefined || methodChanges;
  const today = todayKst();
  const currentDate = toDateString(visit.preferredDate);

  // 메모는 언제든 고칠 수 있지만, 일정·상태는 살아 있는(또는 막 끝난) 구독에서만 움직인다.
  if (touchesSchedule && visit.plan.status !== 'ACTIVE' && visit.plan.status !== 'EXPIRED') {
    return NextResponse.json(
      { error: '취소되었거나 입금 전인 구독의 방문은 바꿀 수 없습니다.' },
      { status: 409 },
    );
  }
  if (statusChanges && !canTransitionVisit(visit.status, nextStatus)) {
    return NextResponse.json(
      { error: '지금 상태에서는 그렇게 바꿀 수 없습니다. 화면을 새로고침해 주세요.' },
      { status: 409 },
    );
  }
  if (statusChanges && nextStatus === 'COMPLETED' && currentDate > today) {
    return NextResponse.json(
      { error: '방문일이 아직 오지 않았습니다. 미리 다녀왔다면 방문일을 먼저 바꿔 주세요.' },
      { status: 409 },
    );
  }
  if ((date !== undefined || timeSlot !== undefined || methodChanges) && visit.status === 'COMPLETED') {
    return NextResponse.json(
      { error: '완료된 방문은 일정을 바꿀 수 없습니다. 먼저 완료를 되돌려 주세요.' },
      { status: 409 },
    );
  }
  // 결과는 점검을 마친 회차의 기록이다 — 예정·취소된 회차에 결과가 붙으면 고객 화면이
  // "점검하지 않은 날의 결과"를 보여 주게 된다.
  const touchesResult = result !== undefined || resultNote !== undefined;
  if (touchesResult && (nextStatus ?? visit.status) !== 'COMPLETED') {
    return NextResponse.json(
      { error: '점검 결과는 완료 처리한 회차에만 남길 수 있습니다.' },
      { status: 409 },
    );
  }
  if (date !== undefined) {
    const issue = adminVisitDateIssue({
      date,
      startDate: visit.plan.startDate ? toDateString(visit.plan.startDate) : '',
      endDate: visit.plan.endDate ? toDateString(visit.plan.endDate) : '',
      today,
      round: visit.round,
    });
    if (issue) {
      return NextResponse.json({ error: `옮길 수 없는 날짜입니다. ${issue}` }, { status: 400 });
    }
  // 같은 날 두 건은 고객 달력이 그날을 막아 버려 풀 수 없게 된다 — 대리 예약(POST)과 같은 규칙.
  if (
    date !== undefined &&
    date !== currentDate &&
    visit.plan.visits.some(
      (v) => v.id !== visitId && occupiesRound(v.status) && toDateString(v.preferredDate) === date,
    )
  ) {
    return NextResponse.json(
      { error: '그날은 이미 다른 점검이 잡혀 있습니다.' },
      { status: 409 },
    );
  }
  }

  const now = new Date();
  const data: {
    status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELED';
    adminMemo?: string | null;
    preferredDate?: Date;
    timeSlot?: 'MORNING' | 'AFTERNOON' | 'ANY';
    method?: 'PHONE' | 'ONSITE';
    result?: 'NORMAL' | 'CAUTION' | 'NEEDS_VISIT' | null;
    resultNote?: string | null;
    completedAt?: Date | null;
    canceledAt?: Date | null;
  } = {};
  if (adminMemo !== undefined) data.adminMemo = adminMemo || null;
  if (date !== undefined) data.preferredDate = fromDateString(date);
  if (timeSlot !== undefined) data.timeSlot = timeSlot;
  if (methodChanges) data.method = method;
  if (result !== undefined) data.result = result ?? null;
  if (resultNote !== undefined) data.resultNote = resultNote || null;
  if (statusChanges) {
    data.status = nextStatus;
    // 상태와 타임스탬프를 항상 함께 옮긴다 — 되돌릴 때 이전 흔적이 남아 있으면
    // "완료인데 취소 시각이 있는" 모순된 행이 만들어진다.
    data.completedAt = nextStatus === 'COMPLETED' ? now : null;
    data.canceledAt = nextStatus === 'CANCELED' ? now : null;
    // 완료를 되돌리면 그 점검은 일어나지 않은 것이다 — 결과도 함께 지운다.
    if (visit.status === 'COMPLETED' && nextStatus !== 'COMPLETED') {
      data.result = null;
      data.resultNote = null;
    }
  }

  // CAS — 읽은 뒤에 고객이 날짜를 바꾸거나 다른 관리자가 먼저 처리했다면 덮어쓰지 않는다.
  // 날짜는 일정·상태를 움직이는 요청에만 건다: 담당 메모는 "누가 가는가"의 기록이라 고객이
  // 그 사이 날짜를 옮겼다고 해서 무효가 되지 않는다(막으면 관리자는 다시 타이핑할 수밖에 없다).
  const saved = await prisma.inspectionVisit.updateMany({
    where: {
      id: visitId,
      status: visit.status,
      ...(touchesSchedule ? { preferredDate: visit.preferredDate } : {}),
    },
    data,
  });
  if (saved.count === 0) {
    return NextResponse.json(
      { error: '방금 다른 곳에서 일정이 바뀌었습니다. 화면을 새로고침해 주세요.' },
      { status: 409 },
    );
  }

  // 고객은 이 변화를 보고 있지 않다 — 일정이 움직였으면 알린다. 완료 처리와 메모는 알리지 않는다.
  // 이미 끝난 구독에는 보내지 않는다: "새 날짜를 선택해 주세요"·"예약되었습니다"가 거짓말이 된다.
  const newDate = date ?? currentDate;
  const newSlot = timeSlot ?? visit.timeSlot;
  const newMethod = method ?? visit.method;
  const slotChanged = timeSlot !== undefined && timeSlot !== visit.timeSlot;
  const phone = visit.plan.contactPhone;
  const round = visit.round;
  if (visit.plan.status === 'ACTIVE') {
    if (statusChanges && nextStatus === 'CANCELED') {
      await sendSms(
        phone,
        smsInspectionVisitCanceled({
          round,
          date: currentDate,
          method: newMethod,
          portalUrl: inspectionPortalUrl(),
        }),
      );
    } else if (methodChanges && newMethod === 'ONSITE') {
      // 방문으로 바뀌면 고객이 집에 있어야 한다 — 날짜·시간대를 한 문자에 모두 싣는다.
      await sendSms(
        phone,
        smsInspectionSwitchedToOnsite({ round, date: newDate, timeSlot: newSlot }),
      );
    } else if (statusChanges && nextStatus === 'SCHEDULED' && visit.status !== 'COMPLETED') {
      // 취소됐던 방문을 되살렸거나, 확정 보류(REQUESTED)였던 희망일을 확정한 경우 — 날짜를 그대로
      // 뒀더라도 고객이 마지막으로 들은 말은 "취소됐다"/"다시 골라 달라"였으므로 반드시 알린다.
      await sendSms(phone, smsInspectionVisitBooked({ round, date: newDate, method: newMethod }));
    } else if (newDate !== currentDate || slotChanged || methodChanges) {
      // 방문 → 전화로 되돌린 경우도 여기로 온다 — "전화 점검이 …로 변경"으로 알린다.
      await sendSms(
        phone,
        smsInspectionVisitRescheduled({
          round,
          method: newMethod,
          date: newDate,
          timeSlot: slotChanged ? timeSlot : null,
        }),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    visit: {
      visitId,
      date: newDate,
      status: nextStatus ?? visit.status,
      method: newMethod,
      // 저장한 값 그대로 — 완료를 되돌려 결과를 지운 경우(data.result = null)도 반영한다.
      result: 'result' in data ? data.result : visit.result,
      resultNote: 'resultNote' in data ? data.resultNote : visit.resultNote,
      adminMemo: adminMemo !== undefined ? adminMemo || null : visit.adminMemo,
    },
  });
}
