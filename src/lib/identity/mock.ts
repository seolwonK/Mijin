import type { IdentityProvider } from './index';

// 개발용 본인인증 provider. 실제 통신사 인증 없이, 사용자가 입력한 이름/휴대폰을
// 그대로 "인증된 것"으로 처리한다. IDENTITY_PROVIDER 가 'portone' 이 아닐 때 사용.
// 프로덕션에서는 절대 이 provider 로 두면 안 된다.
export const mockProvider: IdentityProvider = {
  name: 'mock',
  async verify({ name, phone }) {
    const cleanName = (name ?? '').trim();
    const cleanPhone = (phone ?? '').replace(/\D/g, '');
    if (!cleanName || !cleanPhone) {
      throw new Error('이름과 휴대폰번호를 입력해 주세요 (개발용 인증)');
    }
    return {
      providerRef: `mock-${cleanPhone}`,
      name: cleanName,
      phone: cleanPhone,
      // 중복가입 방지 로직을 개발 중에도 흉내 낼 수 있도록 안정적인 가짜 CI 부여
      ci: `mock-ci-${cleanPhone}`,
      di: `mock-di-${cleanPhone}`,
    };
  },
};
