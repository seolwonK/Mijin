import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { sanitizeRegionKeys } from '@/lib/regions';

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
  regions: z.array(z.string()).optional(),
  password: z.string().min(8, '비밀번호는 8자 이상').optional(),
  // 소개자 지정/변경(string)·해제(null). 미포함이면 변경하지 않는다.
  referredByUserId: z.string().min(1).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const p = await prisma.provider.findUnique({
    where: { id },
    include: {
      user: { select: { loginId: true, name: true, phone: true } },
      referredBy: { select: { id: true, name: true, role: true } },
    },
  });
  if (!p) return NextResponse.json({ error: '업체를 찾을 수 없습니다' }, { status: 404 });

  // 만족도 조사 요약(평균·건수) + 최근 20건 — 제출된(rating != null) 것만 집계 대상.
  const [reviewAgg, reviews] = await Promise.all([
    prisma.satisfactionSurvey.aggregate({
      where: { providerId: id, rating: { not: null } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.satisfactionSurvey.findMany({
      where: { providerId: id, rating: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        requestId: true,
        rating: true,
        comment: true,
        paidAmount: true,
        submittedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    id: p.id,
    loginId: p.user.loginId,
    name: p.user.name,
    phone: p.user.phone,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    isActive: p.isActive,
    memo: p.memo,
    regions: p.regions,
    approvalStatus: p.approvalStatus,
    bizRegNo: p.bizRegNo,
    hasCert: !!(p.bizCertFileId || p.bizCertPath),
    appliedAt: p.appliedAt,
    rejectReason: p.rejectReason,
    referredBy: p.referredBy
      ? {
          userId: p.referredBy.id,
          name: p.referredBy.name,
          type: p.referredBy.role === 'PROVIDER' ? '업체' : '기술자',
        }
      : null,
    reviewCount: reviewAgg._count._all,
    avgRating: reviewAgg._count._all > 0 ? reviewAgg._avg.rating : null,
    reviews,
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

  const provider = await prisma.provider.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: '업체를 찾을 수 없습니다' }, { status: 404 });
  }

  const providerData: Record<string, unknown> = {};
  if (data.address !== undefined) providerData.address = data.address;
  if (data.lat !== undefined) providerData.lat = data.lat;
  if (data.lng !== undefined) providerData.lng = data.lng;
  if (data.isActive !== undefined) providerData.isActive = data.isActive;
  if (data.memo !== undefined) providerData.memo = data.memo;
  if (data.regions !== undefined) providerData.regions = sanitizeRegionKeys(data.regions);

  // 소개자 소급 지정/변경/해제 — 검증(존재·승인·활성·자기 자신 아님)은 PATCH할 때마다 재확인한다.
  if (data.referredByUserId !== undefined) {
    if (data.referredByUserId === null) {
      providerData.referredByUserId = null;
    } else {
      const referrer = await prisma.user.findUnique({
        where: { id: data.referredByUserId },
        select: {
          id: true,
          role: true,
          provider: { select: { approvalStatus: true, isActive: true } },
          technician: { select: { approvalStatus: true, isActive: true } },
        },
      });
      const entity =
        referrer &&
        (referrer.role === 'PROVIDER'
          ? referrer.provider
          : referrer.role === 'TECHNICIAN'
            ? referrer.technician
            : null);
      if (!referrer || !entity || entity.approvalStatus !== 'APPROVED' || !entity.isActive) {
        return NextResponse.json({ error: '추천인을 찾을 수 없습니다' }, { status: 400 });
      }
      if (referrer.id === provider.userId) {
        return NextResponse.json(
          { error: '본인을 추천인으로 지정할 수 없습니다' },
          { status: 400 },
        );
      }
      providerData.referredByUserId = referrer.id;
    }
  }

  const userData: Record<string, unknown> = {};
  if (data.name !== undefined) userData.name = data.name;
  if (data.phone !== undefined) userData.phone = data.phone;
  if (data.password !== undefined) {
    userData.passwordHash = await bcrypt.hash(data.password, 10);
  }

  await prisma.$transaction([
    ...(Object.keys(providerData).length
      ? [prisma.provider.update({ where: { id }, data: providerData })]
      : []),
    ...(Object.keys(userData).length
      ? [prisma.user.update({ where: { id: provider.userId }, data: userData })]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}
