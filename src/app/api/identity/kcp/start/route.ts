import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identityProviderName } from '@/lib/identity/config';
import { KCP_BIND_COOKIE, KCP_SESSION_TTL_MS, sanitizeReturnPath, startKcpSession } from '@/lib/identity/kcp/session';
import { resolveOrigin } from '@/lib/identity/kcp/origin';
import { KcpApiError } from '@/lib/identity/kcp/api';

// NHN KCP 본인확인(V2) 시작 — 서버가 KCP 에 거래등록을 하고, 브라우저가 인증창을 열 재료를 돌려준다.
//   응답: { ok, ordrIdxx, regCertKey, callUrl }
//   브라우저는 callUrl 에 form POST(reg_cert_key, kcp_page_submit_yn)로 KCP 인증창을 띄운다(client.ts).
//   인증이 끝나면 KCP 가 /api/identity/kcp/return 으로 결과를 보내고, 이후 /api/identity/verify 에
//   ordrIdxx 를 identityVerificationId 로 보내면 서버가 KCP 결과조회로 신원을 확정한다.
// ENC_KEY 등 비밀은 이 응답에 절대 실리지 않는다. reg_cert_key 는 인증창 호출에 필요해 내려주지만,
// 그것만으로는 결과조회를 할 수 없다(결과조회는 서버가 site_cd 헤더 + ordr_idxx 짝으로만 한다).
// 거래를 시작한 브라우저에는 httpOnly 쿠키(KCP_BIND_COOKIE)를 심고, /api/identity/verify 가 같은 쿠키를 요구한다.

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  mode: z.enum(['POPUP', 'PAGE']).default('POPUP'),
  returnPath: z.string().max(200).optional(),
});

// 인메모리 레이트리밋: IP당 10분에 10회 — 거래등록은 KCP 호출이라 남용을 막는다.
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
  return h.count > 10;
}

function isKcpProvider(): boolean {
  try {
    return identityProviderName() === 'kcp';
  } catch {
    // 프로덕션 fail-closed(설정 누락) — 여기서는 "kcp 가 아니다"로만 답하면 된다.
    return false;
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  if (!isKcpProvider()) {
    return NextResponse.json(
      { error: 'KCP 본인인증이 설정되지 않았습니다 (IDENTITY_PROVIDER=kcp 가 아닙니다)' },
      { status: 400 },
    );
  }

  // 본문은 선택 — 비어 있거나 JSON 이 아니면 기본값(POPUP, /tech/signup)으로 간다.
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값을 확인해 주세요' }, { status: 400 });
  }

  try {
    const { bindSecret, ...started } = await startKcpSession({
      mode: parsed.data.mode,
      returnPath: sanitizeReturnPath(parsed.data.returnPath),
      retUrl: `${resolveOrigin(req)}/api/identity/kcp/return`,
    });
    const res = NextResponse.json(
      { ok: true, ...started },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    // SameSite=Lax: KCP(타 사이트)에서 돌아오는 톱레벨 이동에도 실리고, 이후 같은 출처 fetch 에도 실린다.
    res.cookies.set({
      name: KCP_BIND_COOKIE,
      value: bindSecret,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/identity',
      maxAge: Math.floor(KCP_SESSION_TTL_MS / 1000),
    });
    return res;
  } catch (e) {
    console.error('[identity/kcp/start] 거래등록 실패', e);
    return NextResponse.json(
      {
        error: '본인인증 서버(KCP) 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        // KCP 가 준 코드·문구만 진단용으로 내려준다. DB·설정 오류의 message 는 내부 정보(호스트 등)를 담을 수 있어 내보내지 않는다.
        ...(e instanceof KcpApiError ? { detail: e.message.slice(0, 200) } : {}),
      },
      { status: 502 },
    );
  }
}
