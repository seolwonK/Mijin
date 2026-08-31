import { prisma } from '@/lib/db';
import { getCandidates } from '@/lib/matching';
import { claimAndAssign } from '@/lib/assignment';
import { regionFromAddress } from '@/lib/regions';
import { notifyAdminAttention } from '@/lib/adminAlerts';
import { sendSms } from '@/lib/sms';
import { smsAssignmentRecalled } from '@/lib/sms/templates';
import { assigneeKey } from '@/lib/assignee';

// 무응답 자동 회수 응답 제한시간(분) — 제한시간이 지나면 회수 후 즉시 다음 순위에게
// 재배정한다("접수 즉시 배정 + 무응답 10분 순차 재배정" 운영 결정, 2026-08-31).
// 설정 화면 항목이 아닌 코드 상수(변경 시 배포 필요) — 배정로직 상세 문서 12장 참조.
export const RESPONSE_TIMEOUT_MINUTES = {
  CRITICAL: 10,
  URGENT: 10,
  NORMAL: 10,
} as const;

type RequestLike = {
  id: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  urgency: 'CRITICAL' | 'URGENT' | 'NORMAL';
  lookupCode: string;
  needsAttention: boolean;
};

// 배정대기 접수 1건에 대해 후보를 골라 배정한다 — 즉시 배정·워커·무응답 재배정 공용.
// 실패 사유별로 확인요망 전환 + (전환 시점에만) 관리자 문자.
async function pickAndAssign(
  req: RequestLike,
): Promise<'assigned' | 'no-region' | 'no-candidate' | 'lost-race'> {
  // 자동배정은 접수 주소에서 지역(시/도)이 판별될 때만 수행한다.
  // 판별 불가 접수는 후보 필터(coversRegion)가 전원 통과로 무력화되어, 알 순위가
  // 거리보다 앞서는 사슬 특성상 원거리 알 부자에게 배정될 수 있다 — 확인요망으로
  // 관리자 판단(거리 정렬 참고)에 맡긴다.
  if (regionFromAddress(req.address) == null) {
    await prisma.serviceRequest.updateMany({
      where: { id: req.id, status: 'RECEIVED' },
      data: { needsAttention: true, assignBaseAt: new Date() },
    });
    if (!req.needsAttention) void notifyAdminAttention(req, '지역 판별 불가 — 자동배정 제외');
    console.warn(`[autoAssign] 지역 판별 불가 → 관리자 반환: ${req.id}`);
    return 'no-region';
  }

  // 이 접수 지역을 담당(coversRegion)하고 거절·무응답 이력이 없는 활성 대상.
  // getCandidates 정렬 사슬(알>순환>별점>거리)의 첫 후보를 선택한다.
  const candidates = (await getCandidates(req)).filter(
    (c) => !c.rejectedThisRequest && c.coversRegion,
  );
  const best = candidates[0];
  if (!best) {
    await prisma.serviceRequest.updateMany({
      where: { id: req.id, status: 'RECEIVED' },
      data: { needsAttention: true, assignBaseAt: new Date() },
    });
    if (!req.needsAttention) void notifyAdminAttention(req, '담당 지역 배정 후보 없음');
    console.warn(`[autoAssign] 담당 지역 배정 대상 없음 → 관리자 반환: ${req.id}`);
    return 'no-candidate';
  }

  const ok = await claimAndAssign({
    requestId: req.id,
    target: { kind: best.kind, id: best.id },
    assignedBy: 'AUTO',
    distanceKm: best.distanceKm,
  });
  if (!ok) return 'lost-race'; // 그 사이 관리자 수동 배정 등 — CAS 패배는 정상 경로
  console.log(
    `[autoAssign] 자동 배정: ${req.id} → ${best.name} (${
      best.distanceKm != null ? `${best.distanceKm.toFixed(1)}km` : '지역 매칭'
    })`,
  );
  return 'assigned';
}

// 접수 생성 직후 즉시 배정 — POST /api/requests 가 fire-and-forget 으로 호출한다
// (좌표 백필 뒤에 실행돼 거리 단계까지 정상 작동). 자동배정 토글이 꺼져 있으면
// 아무것도 하지 않고, 기존 대기시간 경로(워커)가 관리자 선검토 창으로 남는다.
export async function autoAssignNewRequest(requestId: string): Promise<void> {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.autoAssignEnabled) return;
    const req = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!req || req.status !== 'RECEIVED') return;
    await pickAndAssign(req);
  } catch (e) {
    console.error('[autoAssign] 즉시 배정 실패(워커가 재시도)', e);
  }
}

// 응답 제한시간을 넘긴 무응답 배정을 자동 회수(EXPIRED)하고 즉시 다음 순위에게
// 재배정한다. 회수·재배정 모두 상태 조건부 갱신(CAS)이라 수락/거절과의 동시 경합은
// 응답이 한발 먼저면 회수가 없던 일이 된다.
// - 무응답 대상은 matching.ts 에서 거절과 같은 최후순위(사실상 제외)가 된다
// - 재배정 후보가 없으면 배정대기 + 확인요망 + 관리자 문자로 남는다
// - 회수 자체는 자동배정 토글과 무관하게 동작한다(전 건 수동 운영에서도 방치 방지).
//   단 "즉시 재배정"은 토글이 켜져 있을 때만 한다.
export async function recallStaleAssignments(
  autoReassign: boolean,
): Promise<{ recalled: number }> {
  const now = Date.now();
  const pending = await prisma.assignment.findMany({
    where: { status: 'REQUESTED', request: { status: 'ASSIGNED' } },
    include: {
      request: true,
      provider: { include: { user: { select: { phone: true } } } },
      technician: { include: { user: { select: { phone: true } } } },
    },
  });

  let recalled = 0;
  for (const a of pending) {
    const limitMs = RESPONSE_TIMEOUT_MINUTES[a.request.urgency] * 60_000;
    if (a.createdAt.getTime() + limitMs > now) continue;

    const expired = await prisma.assignment.updateMany({
      where: { id: a.id, status: 'REQUESTED' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
    if (expired.count === 0) continue;

    await prisma.serviceRequest.updateMany({
      where: { id: a.requestId, status: 'ASSIGNED' },
      data: { status: 'RECEIVED', assignBaseAt: new Date() },
    });
    recalled++;

    const assigneePhone = a.provider?.user.phone ?? a.technician?.user.phone;
    if (assigneePhone) void sendSms(assigneePhone, smsAssignmentRecalled(), a.requestId);
    console.warn(
      `[autoAssign] 무응답 자동 회수: ${a.requestId} (${assigneeKey(a) ?? '?'}, ${
        RESPONSE_TIMEOUT_MINUTES[a.request.urgency]
      }분 초과)`,
    );

    // 즉시 다음 순위 재배정 — 방금 EXPIRED 처리된 대상은 matching 의 이력 필터가 거른다.
    if (autoReassign) {
      await pickAndAssign({ ...a.request, needsAttention: false });
    } else {
      await prisma.serviceRequest.updateMany({
        where: { id: a.requestId, status: 'RECEIVED' },
        data: { needsAttention: true },
      });
      void notifyAdminAttention(a.request, '배정 무응답으로 자동 회수됨');
    }
  }
  return { recalled };
}

// 워커(30초 주기)와 /api/internal/auto-assign(cron 백업)의 공용 진입점.
// 1) 무응답 회수(+토글 켜짐 시 즉시 재배정)
// 2) 대기시간이 지난 배정대기 접수 배정 — 즉시 배정이 실패했거나(서버 재기동 등)
//    토글이 꺼졌다 켜진 사이 쌓인 접수를 수습하는 안전망.
export async function runAutoAssign(): Promise<{ assigned: number; recalled: number }> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const enabled = !!settings?.autoAssignEnabled;

  const { recalled } = await recallStaleAssignments(enabled);
  if (!settings || !enabled) return { assigned: 0, recalled };

  const waitMinutes = {
    CRITICAL: settings.waitMinutesCritical,
    URGENT: settings.waitMinutesUrgent,
    NORMAL: settings.waitMinutesNormal,
  } as const;

  const now = new Date();
  const received = await prisma.serviceRequest.findMany({
    where: { status: 'RECEIVED' },
    orderBy: { assignBaseAt: 'asc' },
  });

  let assigned = 0;
  for (const req of received) {
    const deadline = req.assignBaseAt.getTime() + waitMinutes[req.urgency] * 60_000;
    if (deadline > now.getTime()) continue;
    if ((await pickAndAssign(req)) === 'assigned') assigned++;
  }
  return { assigned, recalled };
}
