import { prisma } from '@/lib/db';
import { getCandidates } from '@/lib/matching';
import { claimAndAssign } from '@/lib/assignment';

// 대기시간(긴급도별, 관리자 설정)을 초과한 미배정 접수를 최근접 활성 업체에 자동 배정.
// instrumentation 워커(30초 주기)와 /api/internal/auto-assign(cron 백업)에서 공용.
export async function runAutoAssign(): Promise<{ assigned: number }> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.autoAssignEnabled) return { assigned: 0 };

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

    // 좌표가 없으면 거리 기준 자동배정 불가 → 관리자에게 반환.
    // assignBaseAt을 리셋해 다음 대기시간 경과 전까지 재시도하지 않는다.
    if (req.lat == null || req.lng == null) {
      await prisma.serviceRequest.update({
        where: { id: req.id },
        data: { needsAttention: true, assignBaseAt: now },
      });
      console.warn(`[autoAssign] 좌표 없음 → 관리자 반환: ${req.id}`);
      continue;
    }

    // 좌표 미등록 업체(distanceKm null)는 "가장 가까운 업체" 판단이 불가하므로 자동배정에서 제외
    const candidates = (await getCandidates(req)).filter(
      (c) => !c.rejectedThisRequest && c.distanceKm != null,
    );
    const best = candidates[0];
    if (!best) {
      await prisma.serviceRequest.update({
        where: { id: req.id },
        data: { needsAttention: true, assignBaseAt: now },
      });
      console.warn(`[autoAssign] 배정 가능 업체 없음 → 관리자 반환: ${req.id}`);
      continue;
    }

    const ok = await claimAndAssign({
      requestId: req.id,
      providerId: best.providerId,
      assignedBy: 'AUTO',
      distanceKm: best.distanceKm,
    });
    if (ok) {
      assigned++;
      console.log(
        `[autoAssign] 자동 배정: ${req.id} → ${best.name} (${best.distanceKm?.toFixed(1)}km)`,
      );
    }
  }
  return { assigned };
}
