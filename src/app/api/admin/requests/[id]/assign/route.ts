import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { claimAndAssign } from '@/lib/assignment';
import { haversineKm } from '@/lib/geo/distance';

const assignSchema = z.object({
  assigneeKind: z.enum(['PROVIDER', 'TECHNICIAN']),
  assigneeId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '배정 대상을 선택해 주세요' }, { status: 400 });
  }
  const { assigneeKind, assigneeId } = parsed.data;

  const request = await prisma.serviceRequest.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: '접수를 찾을 수 없습니다' }, { status: 404 });
  }

  // 업체/기술자 각 테이블에서 활성·승인 여부와 좌표를 확인
  const target =
    assigneeKind === 'PROVIDER'
      ? await prisma.provider.findUnique({ where: { id: assigneeId } })
      : await prisma.technician.findUnique({ where: { id: assigneeId } });
  if (!target || !target.isActive || target.approvalStatus !== 'APPROVED') {
    return NextResponse.json(
      { error: '배정할 수 없는 대상입니다 (미등록·비활성·미승인)' },
      { status: 400 },
    );
  }

  // 기술자는 근로계약서 서명 완료 후에만 배정 가능
  if (assigneeKind === 'TECHNICIAN') {
    const contract = await prisma.employmentContract.findUnique({
      where: { technicianId: assigneeId },
      select: { status: true },
    });
    if (contract?.status !== 'CONFIRMED') {
      return NextResponse.json(
        { error: '근로계약서 서명이 완료되지 않은 기술자입니다' },
        { status: 400 },
      );
    }
  }

  const distanceKm =
    request.lat != null &&
    request.lng != null &&
    target.lat != null &&
    target.lng != null
      ? haversineKm(request.lat, request.lng, target.lat, target.lng)
      : null;

  const ok = await claimAndAssign({
    requestId: id,
    target: { kind: assigneeKind, id: target.id },
    assignedBy: 'ADMIN',
    distanceKm,
  });
  if (!ok) {
    return NextResponse.json(
      { error: '배정 대기 상태가 아닙니다. 이미 배정되었거나 취소되었을 수 있습니다.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
