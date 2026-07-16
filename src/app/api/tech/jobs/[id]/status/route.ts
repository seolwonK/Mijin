import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { createSurveyAndNotify } from '@/lib/survey';

const statusSchema = z.object({
  status: z.enum(['DISPATCHED', 'COMPLETED']),
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '상태값이 올바르지 않습니다' }, { status: 400 });
  }

  const a = await prisma.assignment.findUnique({
    where: { id },
    include: { request: true },
  });
  if (!a || a.technicianId !== session.technicianId) {
    return NextResponse.json({ error: '배정 건을 찾을 수 없습니다' }, { status: 404 });
  }
  if (a.status !== 'ACCEPTED') {
    return NextResponse.json({ error: '수락된 배정만 진행할 수 있습니다' }, { status: 409 });
  }

  if (parsed.data.status === 'DISPATCHED') {
    const updated = await prisma.serviceRequest.updateMany({
      where: { id: a.requestId, status: 'ACCEPTED' },
      data: { status: 'DISPATCHED' },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: '출동을 시작할 수 없는 상태입니다' }, { status: 409 });
    }
  } else {
    const updated = await prisma.serviceRequest.updateMany({
      where: { id: a.requestId, status: 'DISPATCHED' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: '완료 처리할 수 없는 상태입니다 (출동 시작을 먼저 눌러주세요)' },
        { status: 409 },
      );
    }
    // 완료 CAS 성공 시에만 만족도 조사 링크를 문자로 보낸다. 재조회 없이 위에서
    // 이미 로드한 배정(a)에서 바로 전달 — 실패해도 완료 응답은 그대로 나간다.
    void createSurveyAndNotify({
      requestId: a.requestId,
      providerId: a.providerId,
      technicianId: a.technicianId,
      phone: a.request.customerPhone,
      origin: new URL(req.url).origin,
    });
  }
  return NextResponse.json({ ok: true });
}
