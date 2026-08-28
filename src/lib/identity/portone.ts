import type { IdentityProvider } from './index';
import { IDENTITY_TTL_MS } from './config';

// PortOne(구 아임포트) V2 본인인증 검증.
// 브라우저 SDK 가 PASS/통신사 인증 팝업을 띄워 identityVerificationId 를 만들고,
// 서버는 그 id 로 PortOne REST API 를 조회해 "정말 인증됐는지"와 실명/휴대폰을 받는다.
// (클라이언트가 보내온 값을 신뢰하지 않고 반드시 서버가 재조회하는 것이 핵심)
// 참고: https://developers.portone.io/api/rest-v2/identityVerification
export const portoneProvider: IdentityProvider = {
  name: 'portone',
  async verify({ identityVerificationId }) {
    const apiSecret = process.env.PORTONE_API_SECRET;
    if (!apiSecret) {
      throw new Error('PORTONE_API_SECRET 환경변수가 필요합니다');
    }
    if (!identityVerificationId) {
      throw new Error('본인인증 정보(identityVerificationId)가 없습니다');
    }

    const url = new URL(
      `https://api.portone.io/identity-verifications/${encodeURIComponent(
        identityVerificationId,
      )}`,
    );
    const storeId = process.env.PORTONE_STORE_ID;
    if (storeId) url.searchParams.set('storeId', storeId);

    const res = await fetch(url, {
      headers: { Authorization: `PortOne ${apiSecret}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`PortOne ${res.status}: ${await res.text()}`);
    }

    // VerifiedIdentityVerification 스키마 (@portone/server-sdk v0.19.0 기준).
    const data = (await res.json()) as {
      status?: string;
      id?: string;
      verifiedAt?: string;
      verifiedCustomer?: {
        name?: string;
        phoneNumber?: string;
        birthDate?: string;
        gender?: string;
        ci?: string;
        di?: string;
      };
    };

    if (data.status !== 'VERIFIED' || !data.verifiedCustomer) {
      throw new Error('본인인증이 완료되지 않았습니다. 다시 시도해 주세요.');
    }

    // 응답이 정말 우리가 조회한 그 건인지 확인한다. 대행사 응답 본문을 그대로 신뢰하지 않고
    // 요청 id 와 대조해, 프록시·캐시 오염 등으로 다른 사람의 인증건이 섞여 들어오는 경로를 닫는다.
    if (data.id && data.id !== identityVerificationId) {
      throw new Error('본인인증 결과가 요청과 일치하지 않습니다. 다시 시도해 주세요.');
    }

    // 인증 완료 시각 신선도 — PortOne 의 인증건은 VERIFIED 로 영구 보존되므로, 이 검사가 없으면
    // 몇 달 전에 끝난 인증의 identityVerificationId 를 지금 제출해도 통과한다(과거 인증정보 재사용).
    // 미래 시각은 서버·대행사 간 시계 오차로 나올 수 있어 막지 않는다 — "너무 오래된 것"만 막는다.
    if (data.verifiedAt) {
      const verifiedAt = Date.parse(data.verifiedAt);
      if (Number.isNaN(verifiedAt)) {
        throw new Error('본인인증 완료 시각을 확인할 수 없습니다. 다시 시도해 주세요.');
      }
      if (Date.now() - verifiedAt > IDENTITY_TTL_MS) {
        throw new Error('본인인증 후 시간이 너무 지났습니다. 다시 인증해 주세요.');
      }
    }

    const c = data.verifiedCustomer;
    return {
      providerRef: identityVerificationId,
      name: (c.name ?? '').trim(),
      phone: (c.phoneNumber ?? '').replace(/\D/g, ''),
      birthDate: c.birthDate,
      gender: c.gender,
      ci: c.ci,
      di: c.di,
    };
  },
};
