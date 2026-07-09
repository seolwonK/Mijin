import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const settingsSchema = z.object({
  autoAssignEnabled: z.boolean(),
  waitMinutesCritical: z.number().int().min(1).max(1440),
  waitMinutesUrgent: z.number().int().min(1).max(1440),
  waitMinutesNormal: z.number().int().min(1).max(1440),
  // 근로계약서 사업주(고용주) 정보 — 미진전기
  employerName: z.string().trim().min(1).max(100),
  employerCeo: z.string().trim().max(50).nullish(),
  employerAddress: z.string().trim().max(200).nullish(),
  employerPhone: z.string().trim().max(30).nullish(),
  employerBizRegNo: z.string().trim().max(20).nullish(),
});

export async function GET() {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '설정값을 확인해 주세요 (대기시간은 1~1440분)' },
      { status: 400 },
    );
  }
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  });
  return NextResponse.json(settings);
}
