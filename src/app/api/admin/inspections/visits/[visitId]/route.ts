import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toDateString } from '@/lib/inspection';

// 방문 1건의 관리자 갱신 — 완료 처리·취소·담당자 메모.
// adminMemo 가 "누가 갔는지"를 적는 칸이다: 기사 배정을 시스템이 하지 않기로 했으므로
// (사용자 결정 2026-09-20) 방문 담당자는 구조화된 FK 가 아니라 자유 메모로 남는다.

const patchSchema = z.object({
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELED']).optional(),
  adminMemo: z.string().trim().max(300).nullish(),
});

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
  const { status, adminMemo } = parsed.data;
  if (status === undefined && adminMemo === undefined) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
  }

  const visit = await prisma.inspectionVisit.findUnique({ where: { id: visitId } });
  if (!visit) {
    return NextResponse.json({ error: '방문 일정을 찾을 수 없습니다' }, { status: 404 });
  }

  const now = new Date();
  const data: {
    status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELED';
    adminMemo?: string | null;
    completedAt?: Date | null;
    canceledAt?: Date | null;
  } = {};
  if (adminMemo !== undefined) data.adminMemo = adminMemo || null;
  if (status !== undefined) {
    data.status = status;
    // 상태와 타임스탬프를 항상 함께 옮긴다 — 되돌릴 때 이전 흔적이 남아 있으면
    // "완료인데 취소 시각이 있는" 모순된 행이 만들어진다.
    data.completedAt = status === 'COMPLETED' ? now : null;
    data.canceledAt = status === 'CANCELED' ? now : null;
  }

  const updated = await prisma.inspectionVisit.update({
    where: { id: visitId },
    data,
  });
  return NextResponse.json({
    ok: true,
    visit: {
      visitId: updated.id,
      date: toDateString(updated.preferredDate),
      status: updated.status,
      adminMemo: updated.adminMemo,
    },
  });
}
