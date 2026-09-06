// KCP 거래 세션·Ret_URL 응답 조립의 계약 — 리뷰에서 "보안상 중요한데 테스트가 없다"고 지적된 경로.
//   · recordKcpReturn: REGISTERED 에서 한 번만 전이한다(공개값 reg_cert_key 로 AUTHED 를 FAILED 로 되돌리는 방해 차단)
//   · startKcpSession: 브라우저 바인딩 비밀을 만들고 해시만 저장한다(응답에는 비밀이 아니라 쿠키로만)
//   · return-view: KCP 가 준 문구가 인라인 스크립트·Location 헤더를 깨지 못한다
//   · resolveOrigin: 프로덕션은 APP_BASE_URL 없이는 Ret_URL 을 만들지 않는다(fail-closed)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Session = {
  ordrIdxx: string;
  regCertKey: string;
  bindHash: string | null;
  mode: string;
  returnPath: string;
  status: string;
  resCd: string | null;
  resMsg: string | null;
  expiresAt: Date;
  authedAt: Date | null;
  consumedAt: Date | null;
};

const db = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  created: [] as Record<string, unknown>[],
  updates: [] as { where: { ordrIdxx: string }; data: Record<string, unknown> }[],
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    kcpCertSession: {
      findUnique: vi.fn(async ({ where }: { where: { ordrIdxx?: string; regCertKey?: string } }) => {
        if (where.ordrIdxx) return db.sessions.get(where.ordrIdxx) ?? null;
        return [...db.sessions.values()].find((s) => s.regCertKey === where.regCertKey) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.created.push(data);
        return data;
      }),
      update: vi.fn(async (args: { where: { ordrIdxx: string }; data: Record<string, unknown> }) => {
        db.updates.push(args);
        const s = db.sessions.get(args.where.ordrIdxx);
        if (s) Object.assign(s, args.data);
        return s;
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

import {
  hashBindSecret,
  KCP_SESSION_TTL_MS,
  recordKcpReturn,
  startKcpSession,
} from '@/lib/identity/kcp/session';
import { jsonForScript, popupHtml, redirectTargetOf, withParams } from '@/lib/identity/kcp/return-view';
import { resolveOrigin } from '@/lib/identity/kcp/origin';

const REG_KEY = '2026090600156579';

function session(over: Partial<Session> = {}): Session {
  return {
    ordrIdxx: 'kc00000001abcdefghijklmnopqrstuvwxyz0123',
    regCertKey: REG_KEY,
    bindHash: 'h',
    mode: 'PAGE',
    returnPath: '/tech/signup',
    status: 'REGISTERED',
    resCd: null,
    resMsg: null,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    authedAt: null,
    consumedAt: null,
    ...over,
  };
}

beforeEach(() => {
  db.sessions.clear();
  db.created.length = 0;
  db.updates.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('recordKcpReturn', () => {
  it('모르는 reg_cert_key 는 null', async () => {
    expect(await recordKcpReturn({ regCertKey: 'nope', resCd: '0000', resMsg: '' })).toBeNull();
  });

  it('REGISTERED + 0000 → AUTHED, authedAt 기록', async () => {
    const s = session();
    db.sessions.set(s.ordrIdxx, s);
    const out = await recordKcpReturn({ regCertKey: REG_KEY, resCd: '0000', resMsg: '정상처리' });
    expect(out).toEqual({ ordrIdxx: s.ordrIdxx, mode: 'PAGE', returnPath: '/tech/signup', ok: true });
    expect(db.updates[0].data).toMatchObject({ status: 'AUTHED', resCd: '0000' });
    expect(db.updates[0].data.authedAt).toBeInstanceOf(Date);
  });

  it('REGISTERED + 실패 코드 → FAILED, 코드·문구를 그대로 돌려준다(길이 제한)', async () => {
    const s = session();
    db.sessions.set(s.ordrIdxx, s);
    const out = await recordKcpReturn({ regCertKey: REG_KEY, resCd: '9999', resMsg: 'x'.repeat(500) });
    expect(out).toMatchObject({ ok: false, code: '9999' });
    expect(db.updates[0].data).toMatchObject({ status: 'FAILED', authedAt: null });
    expect((db.updates[0].data.resMsg as string).length).toBe(200);
  });

  it('AUTHED 뒤에 온 실패 콜백은 상태를 되돌리지 못한다 (공개값 reg_cert_key 로 방해 불가)', async () => {
    const s = session({ status: 'AUTHED', resCd: '0000', authedAt: new Date() });
    db.sessions.set(s.ordrIdxx, s);
    const out = await recordKcpReturn({ regCertKey: REG_KEY, resCd: '9999', resMsg: '위조' });
    expect(out).toMatchObject({ ok: true });
    expect(db.updates).toHaveLength(0);
    expect(s.status).toBe('AUTHED');
  });

  it('FAILED 뒤에 온 0000 콜백도 성공으로 바꾸지 못한다', async () => {
    const s = session({ status: 'FAILED', resCd: '9999', resMsg: '취소' });
    db.sessions.set(s.ordrIdxx, s);
    const out = await recordKcpReturn({ regCertKey: REG_KEY, resCd: '0000', resMsg: '' });
    expect(out).toMatchObject({ ok: false, code: '9999', message: '취소' });
    expect(db.updates).toHaveLength(0);
  });

  it('소비된 거래·만료된 거래는 기록하지 않고 거부 사유만 돌려준다', async () => {
    const used = session({ consumedAt: new Date(), status: 'CONSUMED' });
    db.sessions.set(used.ordrIdxx, used);
    expect(await recordKcpReturn({ regCertKey: REG_KEY, resCd: '0000', resMsg: '' })).toMatchObject({
      ok: false,
      code: 'USED',
    });
    db.sessions.clear();
    const old = session({ expiresAt: new Date(Date.now() - 1) });
    db.sessions.set(old.ordrIdxx, old);
    expect(await recordKcpReturn({ regCertKey: REG_KEY, resCd: '0000', resMsg: '' })).toMatchObject({
      ok: false,
      code: 'EXPIRED',
    });
    expect(db.updates).toHaveLength(0);
  });
});

describe('startKcpSession', () => {
  it('거래등록 후 세션을 만들고, 바인딩 비밀은 해시로만 저장한다', async () => {
    vi.stubEnv('KCP_SITE_CD', 'AO7F3');
    vi.stubEnv('KCP_ENC_KEY', 'k'.repeat(64));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ res_cd: '0000', res_msg: '정상처리', reg_cert_key: REG_KEY, call_url: 'https://cert.kcp.co.kr/certGateway.do' }),
      })),
    );
    const started = await startKcpSession({ mode: 'POPUP', returnPath: '//evil', retUrl: 'https://x/return' });
    expect(started.regCertKey).toBe(REG_KEY);
    expect(started.callUrl).toBe('https://cert.kcp.co.kr/certGateway.do');
    expect(started.bindSecret.length).toBeGreaterThanOrEqual(40);
    expect(db.created).toHaveLength(1);
    const row = db.created[0];
    expect(row.bindHash).toBe(hashBindSecret(started.bindSecret));
    expect(row.bindHash).not.toContain(started.bindSecret);
    expect(row.returnPath).toBe('/tech/signup'); // 오픈 리다이렉트 값은 기본 경로로
    expect(row.status).toBe('REGISTERED');
    expect((row.expiresAt as Date).getTime() - Date.now()).toBeLessThanOrEqual(KCP_SESSION_TTL_MS);
  });

  it('KCP 거래등록이 실패하면 세션 행을 만들지 않는다', async () => {
    vi.stubEnv('KCP_SITE_CD', 'AO7F3');
    vi.stubEnv('KCP_ENC_KEY', 'k'.repeat(64));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ res_cd: 'CS24', res_msg: '정보조회가 올바르지 않습니다.' }) })),
    );
    await expect(
      startKcpSession({ mode: 'POPUP', returnPath: '/tech/signup', retUrl: 'https://x/return' }),
    ).rejects.toThrow('KCP 거래등록 실패 [CS24]');
    expect(db.created).toHaveLength(0);
  });
});

describe('return-view', () => {
  const okOutcome = { ordrIdxx: 'kc1', mode: 'POPUP' as const, returnPath: '/tech/signup', ok: true };

  it('jsonForScript 는 </script>·<!--·U+2028 을 스크립트 밖으로 새지 않게 이스케이프한다', () => {
    const out = jsonForScript({ m: '</script><!--\u2028\u2029<img onerror=1>' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(JSON.parse(out)).toEqual({ m: '</script><!--\u2028\u2029<img onerror=1>' });
  });

  it('redirectTargetOf 는 성공이면 identityVerificationId, 실패면 code/message 를 퍼센트 인코딩해 붙인다', () => {
    expect(redirectTargetOf(okOutcome)).toBe('/tech/signup?identityVerificationId=kc1');
    const fail = redirectTargetOf({ ...okOutcome, ok: false, code: '9999', message: '취소\r\n<x>' });
    expect(fail).toBe('/tech/signup?code=9999&message=%EC%B7%A8%EC%86%8C%0D%0A%3Cx%3E');
    expect(fail).not.toMatch(/[\r\n<>]/);
  });

  it('withParams 는 빈 값을 생략한다', () => {
    expect(withParams('/p', { a: undefined, b: '' })).toBe('/p');
  });

  it('popupHtml 은 우리 출처로만 postMessage 하고, 위험 문자를 담은 결과도 스크립트를 깨지 않는다', () => {
    const html = popupHtml({ ...okOutcome, ok: false, code: '9', message: '</script><script>alert(1)</script>' });
    expect(html).toContain('window.opener.postMessage(result, window.location.origin)');
    // 인라인 스크립트 안에 리터럴 </script> 가 KCP 문구에서 새어 나오지 않는다(우리 닫는 태그 1개뿐).
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain('\\u003c/script>');
  });
});

describe('resolveOrigin', () => {
  function req(headers: Record<string, string> = {}) {
    return new NextRequest('http://internal:3000/api/identity/kcp/start', { headers });
  }

  it('APP_BASE_URL 이 있으면 그것만 쓴다(끝 슬래시 제거)', () => {
    vi.stubEnv('APP_BASE_URL', 'https://xn--ok0bp94bnc26kra.com/');
    expect(resolveOrigin(req({ 'x-forwarded-host': 'evil.example' }))).toBe('https://xn--ok0bp94bnc26kra.com');
  });

  it('프로덕션에서 APP_BASE_URL 이 없으면 요청 헤더로 만들지 않고 던진다 (fail-closed)', () => {
    vi.stubEnv('APP_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => resolveOrigin(req({ 'x-forwarded-host': 'evil.example' }))).toThrow('APP_BASE_URL');
  });

  it('개발 환경은 x-forwarded-* → host → nextUrl 순으로 계산한다', () => {
    vi.stubEnv('APP_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveOrigin(req({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'dev.example' }))).toBe(
      'https://dev.example',
    );
    expect(resolveOrigin(req({ host: 'localhost:3100' }))).toBe('http://localhost:3100');
  });
});
