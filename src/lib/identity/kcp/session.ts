import { createHash, randomBytes, randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { registerCert } from './api';
import { getKcpConfig } from './config';

// KCP 본인확인 거래(KcpCertSession)의 수명 관리 — 시작(거래등록), KCP 콜백 기록, 만료 정리.
// 결과조회·복호화(실제 신원 확인)는 provider(../kcp.ts)가 /api/identity/verify 시점에 한다.

export type KcpMode = 'POPUP' | 'PAGE';

// 시작 → 인증창 → 콜백 → 결과조회까지 허용하는 시간. IdentityVerification 토큰의 10분(IDENTITY_TTL_MS)과는
// 별개의 앞 단계 창이다. 통신사 인증(문자 대기·PASS 앱 전환)이 느린 사용자를 감안해 조금 넉넉히 둔다.
export const KCP_SESSION_TTL_MS = 15 * 60_000;

// 인증창까지 도달했다가 방치된 거래는 신원 정보를 담고 있지 않지만(결과는 KCP 에 있다),
// 무한정 쌓일 이유도 없다. 만료 후 하루 지나면 지운다.
const PURGE_AFTER_MS = 24 * 60 * 60_000;

export const DEFAULT_RETURN_PATH = '/tech/signup';

// 거래를 시작한 브라우저에만 내려주는 httpOnly 쿠키. 결과조회(/api/identity/verify)는 같은 쿠키를 요구한다.
// ordr_idxx·reg_cert_key 는 브라우저에 나가는 공개값이라, 이 바인딩이 없으면 공격자가 우리 서버에서 거래를
// 만들고 피해자에게 KCP 인증창만 열어 준 뒤 ordr_idxx 로 토큰을 받아 가는 경로가 열린다.
export const KCP_BIND_COOKIE = 'kcp_iv_bind';

/** KCP ordr_idxx — 영숫자 50자 이하 규격. `kc` + 시각(base36 8) + 난수 30 = 40자. 브라우저에도 이 값이 나간다. */
export function newOrdrIdxx(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 30; i++) rand += alphabet[randomInt(alphabet.length)];
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8);
  return `kc${ts}${rand}`;
}

export function newBindSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashBindSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * 인증 후 돌아갈 앱 내부 경로. 시작 요청이 준 값을 그대로 믿지 않고 여기서 거른 값만 DB 에 저장한다 —
 * KCP 콜백이 이 값으로 리다이렉트하므로, 외부 주소가 섞이면 오픈 리다이렉트가 된다.
 */
export function sanitizeReturnPath(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_RETURN_PATH;
  const p = input.trim();
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return DEFAULT_RETURN_PATH;
  if (p.length > 200 || /[\s<>"'`]/.test(p)) return DEFAULT_RETURN_PATH;
  // 쿼리·해시는 버린다 — 복귀 파라미터(identityVerificationId 등)는 우리가 붙인다.
  return p.split(/[?#]/)[0] || DEFAULT_RETURN_PATH;
}

export type KcpSessionStart = {
  ordrIdxx: string;
  regCertKey: string;
  callUrl: string;
  /** 쿠키로만 내려간다 — 응답 본문에 싣지 말 것. */
  bindSecret: string;
};

/** 거래등록을 하고 세션 행을 남긴다. KCP 가 실패하면 행을 만들지 않는다. */
export async function startKcpSession(input: {
  mode: KcpMode;
  returnPath: string;
  retUrl: string;
}): Promise<KcpSessionStart> {
  const config = getKcpConfig();
  const ordrIdxx = newOrdrIdxx();
  const bindSecret = newBindSecret();
  const reg = await registerCert(config, { ordrIdxx, retUrl: input.retUrl });
  await prisma.kcpCertSession.create({
    data: {
      ordrIdxx,
      regCertKey: reg.regCertKey,
      bindHash: hashBindSecret(bindSecret),
      mode: input.mode,
      returnPath: sanitizeReturnPath(input.returnPath),
      status: 'REGISTERED',
      expiresAt: new Date(Date.now() + KCP_SESSION_TTL_MS),
    },
  });
  void purgeExpiredKcpSessions().catch(() => undefined);
  return { ordrIdxx, regCertKey: reg.regCertKey, callUrl: reg.callUrl, bindSecret };
}

export type KcpReturnOutcome = {
  ordrIdxx: string;
  mode: KcpMode;
  returnPath: string;
  ok: boolean;
  code?: string;
  message?: string;
};

/**
 * KCP 가 Ret_URL 로 보낸 인증창 결과를 세션에 기록한다. 가이드(3-3)대로 reg_cert_key 를 DB 와 대조한다.
 * 여기서는 "인증창이 성공으로 끝났다"는 사실만 남긴다 — 신원은 결과조회(provider.verify)가 KCP 에 직접 물어본다.
 * 그래서 콜백을 위조해 0000 을 보내도 얻는 것이 없다.
 * 상태 전이는 REGISTERED 에서 한 번만 받는다 — reg_cert_key 는 공개값이라, 진짜 성공 뒤에 9999 를 던져
 * AUTHED 를 FAILED 로 되돌리는 방해가 가능하기 때문이다. 두 번째 콜백부터는 저장된 결과를 그대로 돌려준다.
 */
export async function recordKcpReturn(input: {
  regCertKey: string;
  resCd: string;
  resMsg: string;
}): Promise<KcpReturnOutcome | null> {
  const s = await prisma.kcpCertSession.findUnique({ where: { regCertKey: input.regCertKey } });
  if (!s) return null;
  const base = { ordrIdxx: s.ordrIdxx, mode: s.mode as KcpMode, returnPath: s.returnPath };
  if (s.consumedAt || s.status === 'CONSUMED') {
    return { ...base, ok: false, code: 'USED', message: '이미 사용된 본인인증입니다. 다시 인증해 주세요.' };
  }
  if (s.expiresAt.getTime() < Date.now()) {
    return { ...base, ok: false, code: 'EXPIRED', message: '본인인증 시간이 지났습니다. 다시 인증해 주세요.' };
  }
  if (s.status !== 'REGISTERED') {
    if (s.status === 'AUTHED') return { ...base, ok: true };
    return {
      ...base,
      ok: false,
      code: s.resCd || 'KCP_FAIL',
      message: s.resMsg || '본인인증이 취소되었거나 실패했습니다',
    };
  }
  const ok = input.resCd === '0000';
  await prisma.kcpCertSession.update({
    where: { ordrIdxx: s.ordrIdxx },
    data: {
      status: ok ? 'AUTHED' : 'FAILED',
      resCd: input.resCd.slice(0, 10),
      resMsg: input.resMsg.slice(0, 200),
      authedAt: ok ? new Date() : null,
    },
  });
  if (ok) return { ...base, ok: true };
  return {
    ...base,
    ok: false,
    code: input.resCd || 'KCP_FAIL',
    message: input.resMsg || '본인인증이 취소되었거나 실패했습니다',
  };
}

export async function purgeExpiredKcpSessions(): Promise<number> {
  const { count } = await prisma.kcpCertSession.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - PURGE_AFTER_MS) } },
  });
  return count;
}
