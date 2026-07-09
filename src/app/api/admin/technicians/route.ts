import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { geocode } from '@/lib/geo/kakao';

const createSchema = z.object({
  loginId: z.string().trim().min(3, '아이디는 3자 이상').max(30),
  password: z.string().min(8, '비밀번호는 8자 이상'),
  name: z.string().trim().min(1, '성명을 입력해 주세요').max(50),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  address: z.string().trim().min(1, '주소를 입력해 주세요').max(200),
  employmentType: z.enum(['DAILY', 'PERMANENT']),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  memo: z.string().trim().max(500).nullish(),
});

export async function GET() {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const technicians = await prisma.technician.findMany({
    include: {
      user: { select: { loginId: true, name: true, phone: true } },
      contract: { select: { status: true } },
    },
    orderBy: [{ approvalStatus: 'asc' }, { appliedAt: 'desc' }],
  });
  return NextResponse.json({
    technicians: technicians.map((t) => ({
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
    })),
  });
}

// 관리자 직접 등록 — 즉시 승인 상태로 생성
export async function POST(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  let lat = data.lat ?? null;
  let lng = data.lng ?? null;
  if (lat == null || lng == null) {
    const geo = await geocode(data.address);
    if (!geo) {
      return NextResponse.json(
        {
          error: '주소를 좌표로 변환하지 못했습니다. 위도/경도를 직접 입력해 주세요.',
          needManualCoords: true,
        },
        { status: 400 },
      );
    }
    lat = geo.lat;
    lng = geo.lng;
  }

  try {
    const user = await prisma.user.create({
      data: {
        loginId: data.loginId,
        passwordHash: await bcrypt.hash(data.password, 10),
        name: data.name,
        phone: data.phone,
        role: 'TECHNICIAN',
        technician: {
          create: {
            address: data.address,
            lat,
            lng,
            memo: data.memo ?? null,
            employmentType: data.employmentType,
            approvalStatus: 'APPROVED',
            approvedAt: new Date(),
          },
        },
      },
      include: { technician: { select: { id: true } } },
    });
    return NextResponse.json({ id: user.technician!.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { error: '이미 사용 중인 아이디입니다' },
        { status: 409 },
      );
    }
    throw e;
  }
}
