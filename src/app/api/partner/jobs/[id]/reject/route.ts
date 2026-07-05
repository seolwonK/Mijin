import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { getCandidates } from '@/lib/matching';
import { createAssignment } from '@/lib/assignment';

const rejectSchema = z.object({
  reason: z.string().trim().max(200).nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
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
  if (!a || a.providerId !== session.providerId) {
    return NextResponse.json({ error: '배정 건을 찾을 수 없습니다' }, { status: 404 });
  }

  // CAS: 동시 수락/거절 경합 방지
  const claimed = await prisma.assignment.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'REJECTED', rejectReason: reason, respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: '이미 처리된 배정입니다' }, { status: 409 });
  }

  // 자동배정 건이면 즉시 다음 순위 업체로 재배정 시도 (접수는 ASSIGNED 유지)
  if (a.assignedBy === 'AUTO') {
    const candidates = (await getCandidates(a.request)).filter(
      (c) =>
        !c.rejectedThisRequest &&
        c.providerId !== a.providerId &&
        c.distanceKm != null,
    );
    const best = candidates[0];
    if (best) {
      await createAssignment({
        requestId: a.requestId,
        providerId: best.providerId,
        assignedBy: 'AUTO',
        distanceKm: best.distanceKm,
      });
      return NextResponse.json({ ok: true, reassigned: true });
    }
  }

  // 수동배정 건 또는 후보 소진 → 관리자에게 반환 (자동모드가 켜져 있으면 타이머 재가동)
  await prisma.serviceRequest.updateMany({
    where: { id: a.requestId, status: 'ASSIGNED' },
    data: { status: 'RECEIVED', needsAttention: true, assignBaseAt: new Date() },
  });
  return NextResponse.json({ ok: true, reassigned: false });
}
