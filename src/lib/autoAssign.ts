import { prisma } from '@/lib/db';
import { getCandidates } from '@/lib/matching';
import { claimAndAssign } from '@/lib/assignment';
import { regionFromAddress } from '@/lib/regions';

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

    // 좌표가 없어도 접수 주소의 지역(시/도)으로 배정한다.
    // 좌표도 없고 지역도 판별 불가할 때만 관리자에게 반환한다.
    // assignBaseAt을 리셋해 다음 대기시간 경과 전까지 재시도하지 않는다.
    const hasLocation =
      (req.lat != null && req.lng != null) || regionFromAddress(req.address) != null;
    if (!hasLocation) {
      await prisma.serviceRequest.update({
        where: { id: req.id },
        data: { needsAttention: true, assignBaseAt: now },
      });
      console.warn(`[autoAssign] 좌표·지역 판별 불가 → 관리자 반환: ${req.id}`);
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
  return { assigned };
}
