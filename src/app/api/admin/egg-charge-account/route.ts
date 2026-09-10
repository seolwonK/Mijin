import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { eggChargeAccountSchema, eggChargeAccountSelect } from '@/lib/eggChargeAccount';

export async function GET() {
  if (!await requireSession('ADMIN')) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const settings = await prisma.appSettings.findUnique({
    where: { id: 1 }, select: eggChargeAccountSelect,
  });
  return NextResponse.json(settings ?? {
    eggBankName: null, eggBankAccountNumber: null, eggBankAccountHolder: null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  if (!await requireSession('ADMIN')) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = eggChargeAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '계좌 정보를 확인해 주세요.' }, { status: 400 });
  }
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 }, create: { id: 1, ...parsed.data },
    update: parsed.data, select: eggChargeAccountSelect,
  });
  return NextResponse.json(settings);
}
