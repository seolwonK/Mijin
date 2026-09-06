import type { IdentityProvider, IdentityResult } from './index';
import { prisma } from '@/lib/db';
import { IDENTITY_TTL_MS } from './config';
import { getKcpConfig } from './kcp/config';
import { queryCertResult, type KcpCertData } from './kcp/api';
import { hashBindSecret } from './kcp/session';

// NHN KCP 본인확인(V2) 직접 연동 provider — 포트원을 거치지 않는다.
//
// 브라우저가 보내는 identityVerificationId 는 우리가 거래등록 때 만든 ordr_idxx 다. 서버는 그 거래가
// ① 존재하고 ② 아직 안 쓰였고 ③ 만료 전이고 ④ KCP 콜백이 성공(AUTHED)으로 끝났는지 본 뒤,
// KCP 결과조회 API 로 신원(실명·번호·CI/DI)을 **직접** 받아 복호화한다. 클라이언트가 보낸 값은
// 거래 식별자 하나뿐이고 신원은 전부 KCP 응답에서 온다(파라미터 변조 방어는 portone 과 같은 원칙).
//
// 재사용 방지: 같은 ordr_idxx 로 /api/identity/verify 를 반복해도 replayKey("kcp:<reg_cert_key>")
// 유니크 제약(index.ts)이 두 번째부터 거부한다. 세션의 consumedAt CAS 는 그 앞의 빠른 차단이다.
//
// 브라우저 바인딩: 거래를 시작한 브라우저가 받은 httpOnly 쿠키(bindToken)의 해시가 세션의 bindHash 와
// 같아야 한다. ordr_idxx 는 공개값이라 이 검사가 없으면 남이 시작한 거래를 피해자가 인증한 뒤 공격자가
// 토큰을 받아 갈 수 있다(session.ts KCP_BIND_COOKIE 주석).

const ORDR_IDXX_RE = /^[A-Za-z0-9]{1,50}$/;

export const kcpProvider: IdentityProvider = {
  name: 'kcp',
  async verify({ identityVerificationId, bindToken }) {
    const ordrIdxx = (identityVerificationId ?? '').trim();
    if (!ordrIdxx) {
      throw new Error('본인인증 정보(identityVerificationId)가 없습니다');
    }
    if (!ORDR_IDXX_RE.test(ordrIdxx)) {
      throw new Error('본인인증 정보 형식이 올바르지 않습니다. 다시 인증해 주세요.');
    }
    const config = getKcpConfig();

    const session = await prisma.kcpCertSession.findUnique({ where: { ordrIdxx } });
    if (!session) {
      throw new Error('본인인증 정보를 찾을 수 없습니다. 다시 인증해 주세요.');
    }
    if (session.consumedAt) {
      throw new Error('이미 사용된 본인인증입니다. 다시 인증해 주세요.');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new Error('본인인증 후 시간이 너무 지났습니다. 다시 인증해 주세요.');
    }
    if (session.status !== 'AUTHED') {
      throw new Error('본인인증이 완료되지 않았습니다. 다시 시도해 주세요.');
    }
    // portone.ts 의 verifiedAt 신선도와 같은 기준 — 인증창이 끝난 지 10분이 넘은 거래는 받지 않는다.
    if (!session.authedAt || Date.now() - session.authedAt.getTime() > IDENTITY_TTL_MS) {
      throw new Error('본인인증 후 시간이 너무 지났습니다. 다시 인증해 주세요.');
    }
    if (!session.bindHash || !bindToken || hashBindSecret(bindToken) !== session.bindHash) {
      throw new Error('본인인증을 시작한 브라우저에서만 완료할 수 있습니다. 다시 인증해 주세요.');
    }

    // 결과조회는 거래당 한 번 — 동시 요청은 여기서 하나만 통과한다(replayKey 는 그 뒤의 최종 방어선).
    const consumed = await prisma.kcpCertSession.updateMany({
      where: { ordrIdxx, consumedAt: null },
      data: { consumedAt: new Date(), status: 'CONSUMED' },
    });
    if (consumed.count === 0) {
      throw new Error('이미 사용된 본인인증입니다. 다시 인증해 주세요.');
    }

    const cert = await queryCertResult(config, { regCertKey: session.regCertKey, ordrIdxx });
    return toIdentityResult(cert, session.regCertKey);
  },
};

/** KCP 복호화 전문 → 공통 IdentityResult. 형식 정규화만 하고 값의 진위는 KCP 를 믿는다. */
export function toIdentityResult(cert: KcpCertData, regCertKey: string): IdentityResult {
  const birth = (cert.birth_day ?? '').trim();
  return {
    providerRef: regCertKey,
    name: (cert.user_name ?? '').trim(),
    phone: (cert.phone_no ?? '').replace(/\D/g, ''),
    birthDate: /^\d{8}$/.test(birth)
      ? `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}`
      : undefined,
    gender: cert.sex_code === '01' ? 'MALE' : cert.sex_code === '02' ? 'FEMALE' : undefined,
    ci: pickIdentityKey(cert.CI_URL, cert.CI),
    di: pickIdentityKey(cert.DI_URL, cert.DI),
  };
}

// KCP 는 CI/DI 에 특수문자가 섞여 전송 중 깨질 수 있어 URL 인코딩본(CI_URL/DI_URL)을 함께 준다.
// 가이드(3-5)가 인코딩본을 디코딩해 쓰라고 하므로 그것을 우선하고, 없으면 원본을 쓴다.
function pickIdentityKey(urlEncoded?: string, plain?: string): string | undefined {
  const enc = urlEncoded?.trim();
  if (enc) {
    try {
      return decodeURIComponent(enc);
    } catch {
      // 디코딩 불가면 원본으로
    }
  }
  const p = plain?.trim();
  return p || undefined;
}
