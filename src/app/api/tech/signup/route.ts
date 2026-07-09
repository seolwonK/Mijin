import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { geocode } from '@/lib/geo/kakao';

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

  // 좌표는 지오코딩 시도만 (키 없거나 실패해도 신청은 진행 — 승인 시 관리자가 보완)
  const geo = await geocode(data.address);

  await prisma.user.create({
    data: {
      loginId: data.loginId,
      passwordHash: await bcrypt.hash(data.password, 10),
      name: data.name,
      phone: data.phone,
      role: 'TECHNICIAN',
      technician: {
        create: {
          address: data.address,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          employmentType: data.employmentType,
          approvalStatus: 'APPROVED',
          approvedAt: new Date(),
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
