import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { clientIp, createFailureLock, createRateLimiter } from '@/lib/rateLimit';
import { isCrossSiteRequest } from '@/lib/requestOrigin';

const loginSchema = z.object({
  loginId: z.string().trim().min(1, '아이디를 입력해 주세요'),
  password: z.string().min(1, '비밀번호를 입력해 주세요'),
});

// IP당 1분 10회 / 10분 30회. 시도를 먼저 세고, 비밀번호가 맞으면(성공·승인 대기 403 포함) 1회를
// 되돌린다 — 무차별 대입은 틀린 시도의 누적이고, 같은 IP 뒤의 여러 사람(사무실 NAT, E2E 의
// 공유 x-forwarded-for 버킷)이 정상 로그인만으로 막히지 않게 하려는 것이다.
const ipLimiter = createRateLimiter([
  { limit: 10, windowMs: 60_000 },
  { limit: 30, windowMs: 10 * 60_000 },
]);

// 계정(loginId 소문자·trim)별 연속 실패 10회 → 15분 잠금. 성공하면 초기화.
// 없는 아이디도 같은 카운터를 쓴다 — 잠금 여부로 계정 존재를 알 수 없게 한다.
const LOCK_MS = 15 * 60_000;
const accountLock = createFailureLock({ maxFailures: 10, lockMs: LOCK_MS });

// 없는 아이디에도 bcrypt 비교를 한 번 해서 응답 시간으로 계정 존재가 드러나지 않게 한다.
// 비용 인자는 가입 시 해시(bcrypt.hash(…, 10))와 같아야 시간이 맞는다.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('mijin-login-timing-dummy', 10);
  return dummyHash;
}

// 첫 요청이 해시 생성 비용을 떠안지 않도록 모듈 로드 시 미리 만든다.
void getDummyHash();

export async function POST(req: NextRequest) {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청입니다' }, { status: 403 });
  }
  const ip = clientIp(req);
  if (ipLimiter.consume(ip)) {
    return NextResponse.json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

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

  const accountKey = parsed.data.loginId.toLowerCase();
  if (accountLock.begin(accountKey)) {
    return NextResponse.json({ error: '로그인 실패가 반복되어 잠시 잠겼습니다. 15분 뒤 다시 시도해 주세요.' }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { loginId: parsed.data.loginId },
    include: {
      provider: { select: { id: true, approvalStatus: true, rejectReason: true } },
      technician: { select: { id: true, approvalStatus: true, rejectReason: true } },
    },
  });
  const passwordOk = await bcrypt.compare(
    parsed.data.password,
    user?.passwordHash ?? (await getDummyHash()),
  );
  if (!user || !passwordOk) {
    // begin() 이 이미 실패 1회를 적립했다 — 여기서는 그대로 둔다.
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 401 },
    );
  }
  // 자격증명이 맞았다 — 아래 승인 게이트 결과와 무관하게 무차별 대입 카운터에서 뺀다.
  accountLock.succeed(accountKey);
  ipLimiter.refund(ip);

  // 승인 전 업체·전기기사는 로그인 차단 (관리자는 승인 대상 아님)
  const profile =
    user.role === 'PROVIDER'
      ? user.provider
      : user.role === 'TECHNICIAN'
        ? user.technician
        : null;
  if (profile) {
    if (profile.approvalStatus === 'PENDING') {
      return NextResponse.json(
        { error: '가입 승인 대기 중입니다. 승인 완료 후 다시 로그인해 주세요.' },
        { status: 403 },
      );
    }
    if (profile.approvalStatus === 'REJECTED') {
      const reason = profile.rejectReason;
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
    technicianId: user.technician?.id,
  });
  const res = NextResponse.json({ role: user.role, name: user.name });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(user.role));
  return res;
}
