import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { inspectionAccountSchema, inspectionAccountSelect } from '@/lib/inspectionAccount';

// 점검 구독료 입금 계좌 설정 — 알 충전 계좌(api/admin/egg-charge-account)와 같은 계약.
const EMPTY = {
  inspectionBankName: null,
  inspectionBankAccountNumber: null,
  inspectionBankAccountHolder: null,
};

export async function GET() {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const settings = await prisma.appSettings.findUnique({
    where: { id: 1 },
    select: inspectionAccountSelect,
  });
  return NextResponse.json(settings ?? EMPTY, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(req: NextRequest) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = inspectionAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '계좌 정보를 확인해 주세요.' },
      { status: 400 },
    );
  }
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, ...parsed.data },
    update: parsed.data,
    select: inspectionAccountSelect,
  });
  return NextResponse.json(settings);
}
