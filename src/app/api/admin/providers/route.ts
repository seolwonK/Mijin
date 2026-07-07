import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { geocode } from '@/lib/geo/kakao';
import { isValidBizRegNo, normalizeBizRegNo } from '@/lib/bizRegNo';

const createSchema = z.object({
  loginId: z.string().trim().min(3, '아이디는 3자 이상').max(30),
  password: z.string().min(8, '비밀번호는 8자 이상'),
  name: z.string().trim().min(1, '업체명을 입력해 주세요').max(50),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  address: z.string().trim().min(1, '주소를 입력해 주세요').max(200),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  memo: z.string().trim().max(500).nullish(),
  bizRegNo: z.string().trim().nullish(),
});

export async function GET() {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const providers = await prisma.provider.findMany({
    include: { user: { select: { loginId: true, name: true, phone: true } } },
    orderBy: [{ approvalStatus: 'asc' }, { appliedAt: 'desc' }],
  });
  return NextResponse.json({
    providers: providers.map((p) => ({
      id: p.id,
      loginId: p.user.loginId,
      name: p.user.name,
      phone: p.user.phone,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      isActive: p.isActive,
      memo: p.memo,
      approvalStatus: p.approvalStatus,
      bizRegNo: p.bizRegNo,
      hasCert: !!(p.bizCertFileId || p.bizCertPath),
      appliedAt: p.appliedAt,
      rejectReason: p.rejectReason,
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

  let bizRegNo: string | null = null;
  if (data.bizRegNo && data.bizRegNo.trim() !== '') {
    bizRegNo = normalizeBizRegNo(data.bizRegNo);
    if (!isValidBizRegNo(bizRegNo)) {
      return NextResponse.json(
        { error: '사업자등록번호가 올바르지 않습니다' },
        { status: 400 },
      );
    }
  }

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
        role: 'PROVIDER',
        provider: {
          create: {
            address: data.address,
            lat,
            lng,
            memo: data.memo ?? null,
            bizRegNo,
            approvalStatus: 'APPROVED',
            approvedAt: new Date(),
          },
        },
      },
      include: { provider: { select: { id: true } } },
    });
    return NextResponse.json({ id: user.provider!.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { error: '이미 사용 중인 아이디 또는 사업자등록번호입니다' },
        { status: 409 },
      );
    }
    throw e;
  }
}
