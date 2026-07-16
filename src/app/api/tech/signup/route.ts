import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { geocode } from '@/lib/geo/kakao';
import { sanitizeRegionKeys } from '@/lib/regions';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth';

// 개인기술자 셀프 가입. 가입 즉시 자동 승인(APPROVED)되어 바로 로그인할 수 있다.
// 단, 실제 배정(일)은 근로계약서 서명 완료 후에만 가능하다 (matching 에서 게이트).
// 업체 가입과 달리 사업자등록번호·증빙 파일이 없으므로 JSON 으로 받는다.

const fieldsSchema = z.object({
  loginId: z.string().trim().min(3, '아이디는 3자 이상').max(30),
  password: z.string().min(8, '비밀번호는 8자 이상'),
  name: z.string().trim().min(1, '성명을 입력해 주세요').max(50),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  address: z.string().trim().min(1, '주소를 입력해 주세요').max(200),
  employmentType: z.enum(['DAILY', 'PERMANENT']),
  // 서비스 가능 지역 키 목록 (선택). 빈 배열 = 전 지역. 유효 키만 서버에서 다시 거른다.
  regions: z.array(z.string()).optional(),
  // 휴대폰 본인인증(/api/identity/verify) 발급 토큰 — 가입 필수 게이트
  verificationId: z
    .string({ error: '휴대폰 본인인증을 완료해 주세요' })
    .trim()
    .min(1, '휴대폰 본인인증을 완료해 주세요'),
  // 추천인 User.id (선택)
  referrerUserId: z.string().trim().min(1).optional(),
});

// 인메모리 레이트리밋: IP당 10분에 5회 (가입 신청 남용 방지)
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  h.count++;
  return h.count > 5;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const parsed = fieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const dupLogin = await prisma.user.findUnique({
    where: { loginId: data.loginId },
    select: { id: true },
  });
  if (dupLogin) {
    return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
  }

  // 휴대폰 본인인증 게이트: 발급된 인증이 유효(미소비·미만료)하고, 인증한 번호와
  // 가입 번호가 일치해야 한다. 실제 저장은 대행사가 검증한 인증 값(이름·번호)을 신뢰한다.
  const iv = await prisma.identityVerification.findUnique({
    where: { id: data.verificationId },
  });
  if (!iv) {
    return NextResponse.json(
      { error: '본인인증 정보를 찾을 수 없습니다. 다시 인증해 주세요.' },
      { status: 400 },
    );
  }
  if (iv.consumedAt) {
    return NextResponse.json(
      { error: '이미 사용된 본인인증입니다. 다시 인증해 주세요.' },
      { status: 400 },
    );
  }
  if (iv.expiresAt < new Date()) {
    return NextResponse.json(
      { error: '본인인증 유효시간이 지났습니다. 다시 인증해 주세요.' },
      { status: 400 },
    );
  }
  if (iv.phone !== data.phone) {
    return NextResponse.json(
      { error: '본인인증한 번호와 가입 번호가 다릅니다. 다시 인증해 주세요.' },
      { status: 400 },
    );
  }

  // 추천인 검증(선택) — 본인인증된 실제 번호(iv.phone) 기준으로 자기 자신 여부를 판정한다.
  // 트랜잭션 밖에서 읽기 전용으로 먼저 검증하고, 트랜잭션 내부에는 스칼라 값만 반영한다.
  let referredByUserId: string | null = null;
  if (data.referrerUserId) {
    const referrer = await prisma.user.findUnique({
      where: { id: data.referrerUserId },
      select: {
        id: true,
        phone: true,
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
    if (referrer.phone === iv.phone) {
      return NextResponse.json(
        { error: '본인을 추천인으로 지정할 수 없습니다' },
        { status: 400 },
      );
    }
    referredByUserId = referrer.id;
  }

  // 좌표는 지오코딩 시도만 (키 없거나 실패해도 신청은 진행 — 승인 시 관리자가 보완)
  const geo = await geocode(data.address);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const regions = sanitizeRegionKeys(data.regions);

  let created: { id: string; name: string; technicianId?: string };
  try {
    // 인증 소비(CAS)와 가입을 한 트랜잭션으로 — 동시 요청의 인증 재사용을 막는다.
    created = await prisma.$transaction(async (tx) => {
      const consumed = await tx.identityVerification.updateMany({
        where: { id: iv.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw new Error('IDENTITY_ALREADY_USED');
      }
      const user = await tx.user.create({
        data: {
          loginId: data.loginId,
          passwordHash,
          name: iv.name, // 대행사가 검증한 실명
          phone: iv.phone, // 대행사가 검증한 휴대폰
          role: 'TECHNICIAN',
          technician: {
            create: {
              address: data.address,
              lat: geo?.lat ?? null,
              lng: geo?.lng ?? null,
              regions,
              employmentType: data.employmentType,
              approvalStatus: 'APPROVED',
              approvedAt: new Date(),
              referredByUserId,
            },
          },
        },
        select: { id: true, name: true, technician: { select: { id: true } } },
      });
      return { id: user.id, name: user.name, technicianId: user.technician?.id };
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'IDENTITY_ALREADY_USED') {
      return NextResponse.json(
        { error: '이미 사용된 본인인증입니다. 다시 인증해 주세요.' },
        { status: 400 },
      );
    }
    throw e;
  }

  // 가입 즉시 자동 로그인 — 세션 쿠키를 심어 로그인 재입력 없이 바로 이용하게 한다.
  const token = await createSessionToken({
    userId: created.id,
    role: 'TECHNICIAN',
    name: created.name,
    technicianId: created.technicianId,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
