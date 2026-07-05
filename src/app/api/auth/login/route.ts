import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth';

const loginSchema = z.object({
  loginId: z.string().trim().min(1, '아이디를 입력해 주세요'),
  password: z.string().min(1, '비밀번호를 입력해 주세요'),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { loginId: parsed.data.loginId },
    include: {
      provider: { select: { id: true, approvalStatus: true, rejectReason: true } },
    },
  });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 401 },
    );
  }

  // 승인 전 업체는 로그인 차단
  if (user.role === 'PROVIDER') {
    const status = user.provider?.approvalStatus;
    if (status === 'PENDING') {
      return NextResponse.json(
        { error: '가입 승인 대기 중입니다. 승인 완료 후 다시 로그인해 주세요.' },
        { status: 403 },
      );
    }
    if (status === 'REJECTED') {
      const reason = user.provider?.rejectReason;
      return NextResponse.json(
        {
          error: `가입이 승인되지 않았습니다.${reason ? ` 사유: ${reason}` : ''} 관리자에게 문의해 주세요.`,
        },
        { status: 403 },
      );
    }
  }

  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    name: user.name,
    providerId: user.provider?.id,
  });
  const res = NextResponse.json({ role: user.role, name: user.name });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
