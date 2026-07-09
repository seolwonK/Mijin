import type { IdentityProvider } from './index';

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

    const data = (await res.json()) as {
      status?: string;
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
