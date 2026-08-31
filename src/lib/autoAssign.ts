import { prisma } from '@/lib/db';
import { getCandidates } from '@/lib/matching';
import { claimAndAssign } from '@/lib/assignment';
import { regionFromAddress } from '@/lib/regions';
import { notifyAdminAttention } from '@/lib/adminAlerts';
import { sendSms } from '@/lib/sms';
import { smsAssignmentRecalled } from '@/lib/sms/templates';
import { assigneeKey } from '@/lib/assignee';

// 무응답 자동 회수 응답 제한시간(분) — 고객 안내 응대 목표(초긴급 1시간·긴급 2시간)의
// 1/4 수준으로 잡아, 제한시간 안에 3~4명의 후보에게 순차로 돌 수 있게 한다.
// 설정 화면 항목이 아닌 코드 상수(변경 시 배포 필요) — 배정로직 상세 문서 8장 참조.
export const RESPONSE_TIMEOUT_MINUTES = {
  CRITICAL: 15,
  URGENT: 30,
  NORMAL: 120,
} as const;

// 응답 제한시간을 넘긴 무응답 배정을 자동 회수한다(EXPIRED).
// - 배정(REQUESTED) 생성 시각 + 긴급도별 제한시간 초과 → 회수
// - 접수는 배정대기로 복귀 + 확인요망 + 대기 타이머 리셋(수동 회수와 동일한 전이)
// - 무응답 대상은 매칭에서 거절과 같은 최후순위가 되어(matching.ts) 같은 곳에
//   즉시 재배정되는 루프를 막는다
// - 자동배정 토글과 무관하게 동작한다: 전 건 수동 운영이라도 무응답 방치는 막아야 한다
export async function recallStaleAssignments(): Promise<{ recalled: number }> {
  const now = Date.now();
  // 가장 긴 제한시간보다 오래된 것만 후보로 좁혀도 되지만, REQUESTED 인 행은
  // 운영상 극소수라 전량 조회 후 긴급도별 판정이 더 단순하고 안전하다.
  const pending = await prisma.assignment.findMany({
    where: { status: 'REQUESTED', request: { status: 'ASSIGNED' } },
    include: {
      request: { select: { id: true, lookupCode: true, urgency: true } },
      provider: { include: { user: { select: { phone: true } } } },
      technician: { include: { user: { select: { phone: true } } } },
    },
  });

  let recalled = 0;
  for (const a of pending) {
    const limitMs = RESPONSE_TIMEOUT_MINUTES[a.request.urgency] * 60_000;
    if (a.createdAt.getTime() + limitMs > now) continue;

    // 수락/거절과의 레이스는 상태 조건부 갱신(CAS)이 판정 — 응답이 먼저면 여기서 0건.
    const expired = await prisma.assignment.updateMany({
      where: { id: a.id, status: 'REQUESTED' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
    if (expired.count === 0) continue;

    await prisma.serviceRequest.updateMany({
      where: { id: a.requestId, status: 'ASSIGNED' },
      data: { status: 'RECEIVED', needsAttention: true, assignBaseAt: new Date() },
    });
    recalled++;

    const assigneePhone = a.provider?.user.phone ?? a.technician?.user.phone;
    if (assigneePhone) void sendSms(assigneePhone, smsAssignmentRecalled(), a.requestId);
    void notifyAdminAttention(a.request, '배정 무응답으로 자동 회수됨');
    console.warn(
      `[autoAssign] 무응답 자동 회수: ${a.requestId} (${assigneeKey(a) ?? '?'}, ${
        RESPONSE_TIMEOUT_MINUTES[a.request.urgency]
      }분 초과)`,
    );
  }
  return { recalled };
}

// 대기시간(긴급도별, 관리자 설정)을 초과한 미배정 접수를 자동 배정.
// instrumentation 워커(30초 주기)와 /api/internal/auto-assign(cron 백업)에서 공용.
// 무응답 회수는 자동배정 토글과 무관하게 항상 먼저 수행한다.
export async function runAutoAssign(): Promise<{ assigned: number; recalled: number }> {
  const { recalled } = await recallStaleAssignments();

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.autoAssignEnabled) return { assigned: 0, recalled };

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

    // 자동배정은 접수 주소에서 지역(시/도)이 판별될 때만 수행한다.
    // 좌표만 있고 지역 판별이 안 되는 접수를 그대로 돌리면 후보 필터(coversRegion)가
    // 전원 통과로 무력화되어, 알 순위가 거리보다 앞서는 사슬 특성상 원거리 알 부자에게
    // 배정될 수 있다 — 그런 접수는 확인요망으로 관리자 판단(거리 정렬 참고)에 맡긴다.
    if (regionFromAddress(req.address) == null) {
      await prisma.serviceRequest.update({
        where: { id: req.id },
        data: { needsAttention: true, assignBaseAt: now },
      });
      // 30초 주기 재발송 방지: 확인요망 전환 순간에만 통지
      if (!req.needsAttention) {
        void notifyAdminAttention(req, '지역 판별 불가 — 자동배정 제외');
      }
      console.warn(`[autoAssign] 지역 판별 불가 → 관리자 반환: ${req.id}`);
      continue;
    }

    // 이 접수 지역을 담당(coversRegion)하는 활성 대상.
    // getCandidates가 지역 > 거리 순으로 정렬하므로, 좌표가 있으면 가까운 순으로,
    // 없으면 지역 매칭 기준으로 배정된다. (좌표 미등록이어도 제외하지 않음)
    const candidates = (await getCandidates(req)).filter(
      (c) => !c.rejectedThisRequest && c.coversRegion,
    );
    const best = candidates[0];
    if (!best) {
      await prisma.serviceRequest.update({
        where: { id: req.id },
        data: { needsAttention: true, assignBaseAt: now },
      });
      if (!req.needsAttention) {
        void notifyAdminAttention(req, '담당 지역 배정 후보 없음');
      }
      console.warn(`[autoAssign] 담당 지역 배정 대상 없음 → 관리자 반환: ${req.id}`);
      continue;
    }

    const ok = await claimAndAssign({
      requestId: req.id,
      target: { kind: best.kind, id: best.id },
      assignedBy: 'AUTO',
      distanceKm: best.distanceKm,
    });
    if (ok) {
      assigned++;
      console.log(
        `[autoAssign] 자동 배정: ${req.id} → ${best.name} (${
          best.distanceKm != null ? `${best.distanceKm.toFixed(1)}km` : '지역 매칭'
        })`,
      );
    }
  }
  return { assigned, recalled };
}
