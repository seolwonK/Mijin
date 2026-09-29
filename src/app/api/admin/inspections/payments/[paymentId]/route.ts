import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// 월 납부 1건의 입금 확인·되돌리기 (매월 자동이체 — 사용자 결정 2026-09-29).
//
// 자동이체는 고객 은행이 보내고, 이 시스템은 통장을 볼 수 없다. 그래서 관리자가 통장에서 입금을
// 보고 여기서 확인 표시를 한다. 미납은 표시만 하고 이용을 막지 않는다(사용자 결정) — 그래서 이
// 라우트에는 구독 상태를 바꾸는 부수효과가 없다.

const schema = z.object({
  paid: z.boolean({ error: '입금 여부를 확인해 주세요' }),
  note: z.string().trim().max(200, '메모는 200자 이내로 입력해 주세요').nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { paymentId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const { paid, note } = parsed.data;

  const payment = await prisma.inspectionPayment.findUnique({
    where: { id: paymentId },
    select: { seq: true, paidAt: true },
  });
  if (!payment) {
    return NextResponse.json({ error: '납부 기록을 찾을 수 없습니다' }, { status: 404 });
  }
  // 첫 달은 구독을 시작한 입금 확인 그 자체다 — 되돌리려면 구독을 취소해야 한다.
  if (!paid && payment.seq === 1) {
    return NextResponse.json(
      { error: '첫 달 입금은 구독 시작 기록이라 되돌릴 수 없습니다.' },
      { status: 409 },
    );
  }

  // CAS — 두 관리자가 같은 납부를 동시에 누르면 한쪽만 바꾼다. 메모만 고치는 요청은 상태가
  // 같으므로 그대로 통과한다.
  const saved = await prisma.inspectionPayment.updateMany({
    where: { id: paymentId, paidAt: payment.paidAt },
    data: {
      ...(paid !== (payment.paidAt != null)
        ? paid
          ? { paidAt: new Date(), confirmedByUserId: session.userId }
          : { paidAt: null, confirmedByUserId: null }
        : {}),
      ...(note !== undefined ? { note: note || null } : {}),
    },
  });
  if (saved.count === 0) {
    return NextResponse.json(
      { error: '방금 다른 곳에서 처리되었습니다. 화면을 새로고침해 주세요.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
