import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다'))
    .optional(),
  address: z.string().trim().min(1).max(200).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  isActive: z.boolean().optional(),
  memo: z.string().trim().max(500).nullable().optional(),
  employmentType: z.enum(['DAILY', 'PERMANENT']).optional(),
  password: z.string().min(8, '비밀번호는 8자 이상').optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const t = await prisma.technician.findUnique({
    where: { id },
    include: {
      user: { select: { loginId: true, name: true, phone: true } },
      contract: { select: { status: true } },
    },
  });
  if (!t) return NextResponse.json({ error: '기술자를 찾을 수 없습니다' }, { status: 404 });
  return NextResponse.json({
    id: t.id,
    loginId: t.user.loginId,
    name: t.user.name,
    phone: t.user.phone,
    address: t.address,
    lat: t.lat,
    lng: t.lng,
    isActive: t.isActive,
    memo: t.memo,
    employmentType: t.employmentType,
    approvalStatus: t.approvalStatus,
    contractStatus: t.contract?.status ?? null,
    appliedAt: t.appliedAt,
    rejectReason: t.rejectReason,
  });
}

export async function PATCH(
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const technician = await prisma.technician.findUnique({ where: { id } });
  if (!technician) {
    return NextResponse.json({ error: '기술자를 찾을 수 없습니다' }, { status: 404 });
  }

  const technicianData: Record<string, unknown> = {};
  if (data.address !== undefined) technicianData.address = data.address;
  if (data.lat !== undefined) technicianData.lat = data.lat;
  if (data.lng !== undefined) technicianData.lng = data.lng;
  if (data.isActive !== undefined) technicianData.isActive = data.isActive;
  if (data.memo !== undefined) technicianData.memo = data.memo;
  if (data.employmentType !== undefined) technicianData.employmentType = data.employmentType;

  const userData: Record<string, unknown> = {};
  if (data.name !== undefined) userData.name = data.name;
  if (data.phone !== undefined) userData.phone = data.phone;
  if (data.password !== undefined) {
    userData.passwordHash = await bcrypt.hash(data.password, 10);
  }

  await prisma.$transaction([
    ...(Object.keys(technicianData).length
      ? [prisma.technician.update({ where: { id }, data: technicianData })]
      : []),
    ...(Object.keys(userData).length
      ? [prisma.user.update({ where: { id: technician.userId }, data: userData })]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}
