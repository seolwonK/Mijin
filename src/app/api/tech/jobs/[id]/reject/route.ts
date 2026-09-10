import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { getCandidates } from '@/lib/matching';
import { claimAndAssign, transitionPendingAssignment, AssignmentTargetUnavailableError } from '@/lib/assignment';
import { notifyAdminAttention } from '@/lib/adminAlerts';

const rejectSchema = z.object({
  reason: z.string().trim().max(200).nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const { id } = await params;
  let reason: string | null = null;
  try {
    const parsed = rejectSchema.safeParse(await req.json());
    if (parsed.success) reason = parsed.data.reason || null;
  } catch {
    // body 없이 호출해도 허용
  }

  const a = await prisma.assignment.findUnique({
    where: { id },
    include: { request: true },
  });
  if (!a || a.technicianId !== session.technicianId) {
    return NextResponse.json({ error: '배정 건을 찾을 수 없습니다' }, { status: 404 });
  }

  // CAS: 동시 수락/거절 경합 방지
  const claimed = await transitionPendingAssignment({
    assignmentId: id, requestId: a.requestId, status: 'REJECTED', rejectReason: reason,
    needsAttention: false,
  });
  if (!claimed) {
    return NextResponse.json({ error: '이미 처리된 배정입니다' }, { status: 409 });
  }

  // 기존 AUTO 건의 즉시 재배정 정책은 유지한다. 거절과 함께 RECEIVED로 돌아온
  // 접수를 다시 선점하므로, 후보 조회 중 관리자 취소·수동배정이 먼저면 재배정하지 않는다.
  if (a.assignedBy === 'AUTO') {
    const candidates = (await getCandidates(a.request)).filter(
      (c) =>
        !c.rejectedThisRequest &&
        c.coversRegion &&
        !(c.kind === 'TECHNICIAN' && c.id === a.technicianId) &&
        c.distanceKm != null,
    );
    const best = candidates[0];
    if (best) {
      try {
        const reassigned = await claimAndAssign({
          requestId: a.requestId,
          target: { kind: best.kind, id: best.id },
          assignedBy: 'AUTO',
          distanceKm: best.distanceKm,
        });
        return NextResponse.json({ ok: true, reassigned });
      } catch (error) {
        if (!(error instanceof AssignmentTargetUnavailableError)) throw error;
        // 후보 조회 후 영업/승인/계약 상태가 바뀌면 관리자 확인으로 반환한다.
      }
    }
  }

  // 수동배정 건 또는 후보 소진 → 관리자에게 반환 (자동모드가 켜져 있으면 타이머 재가동)
  const marked = await prisma.serviceRequest.updateMany({
    where: { id: a.requestId, status: 'RECEIVED', needsAttention: false },
    data: { needsAttention: true },
  });
  if (marked.count > 0) void notifyAdminAttention(a.request, '기사 거절 — 재배정 후보 없음/수동 판단 필요');
  return NextResponse.json({ ok: true, reassigned: false });
}
