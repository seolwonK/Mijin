import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { sanitizeRegionKeys } from '@/lib/regions';
import { geocode } from '@/lib/geo/kakao';

// 로그인한 업체가 자기 정보(전화·주소·서비스지역·영업상태)를 조회/수정한다.
// 업체명·아이디·사업자번호 같은 신원 정보는 관리자만 바꿀 수 있어 여기서 제외한다.

const patchSchema = z.object({
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다'))
    .optional(),
  address: z.string().trim().min(1, '주소를 입력해 주세요').max(200).optional(),
  regions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const p = await prisma.provider.findUnique({
    where: { id: session.providerId },
    include: { user: { select: { loginId: true, name: true, phone: true } } },
  });
  if (!p) {
    return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다' }, { status: 404 });
  }
  return NextResponse.json({
    loginId: p.user.loginId,
    name: p.user.name,
    phone: p.user.phone,
    address: p.address,
    regions: p.regions,
    isActive: p.isActive,
    approvalStatus: p.approvalStatus,
    bizRegNo: p.bizRegNo,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
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

  const provider = await prisma.provider.findUnique({
    where: { id: session.providerId },
  });
  if (!provider) {
    return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  const providerData: Record<string, unknown> = {};
  if (data.address !== undefined) {
    providerData.address = data.address;
    // 주소가 바뀌면 좌표를 다시 지오코딩 (실패 시 좌표 없음 — 관리자가 보완)
    const geo = await geocode(data.address);
    providerData.lat = geo?.lat ?? null;
    providerData.lng = geo?.lng ?? null;
  }
  if (data.regions !== undefined) providerData.regions = sanitizeRegionKeys(data.regions);
  if (data.isActive !== undefined) providerData.isActive = data.isActive;

  const userData: Record<string, unknown> = {};
  if (data.phone !== undefined) userData.phone = data.phone;

  await prisma.$transaction([
    ...(Object.keys(providerData).length
      ? [prisma.provider.update({ where: { id: session.providerId }, data: providerData })]
      : []),
    ...(Object.keys(userData).length
      ? [prisma.user.update({ where: { id: provider.userId }, data: userData })]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}
