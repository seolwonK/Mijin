import type { IdentityProvider } from './index';

// 개발용 본인인증 provider. 실제 통신사 인증 없이, 사용자가 입력한 이름/휴대폰을
// 그대로 "인증된 것"으로 처리한다. IDENTITY_PROVIDER 가 'portone' 이 아닐 때 사용.
// 프로덕션에서는 절대 이 provider 로 두면 안 된다(config.ts 가 프로덕션에서 막는다).
export const mockProvider: IdentityProvider = {
  name: 'mock',
  async verify({ name, phone }) {
    const cleanName = (name ?? '').trim();
    const cleanPhone = (phone ?? '').replace(/\D/g, '');
    if (!cleanName || !cleanPhone) {
      throw new Error('이름과 휴대폰번호를 입력해 주세요 (개발용 인증)');
    }
    return {
      // 호출마다 새 값이다. mock 에는 "재사용을 막아야 할 대행사 거래건"이라는 개념이 없고
      // (자격증명이 그냥 입력한 이름·번호다), 고정 값을 쓰면 replayKey 유니크 제약에 걸려
      // 같은 번호로 본인인증을 두 번 시도하는 개발 흐름이 막힌다.
      providerRef: `mock-${cleanPhone}-${crypto.randomUUID()}`,
      name: cleanName,
      phone: cleanPhone,
      // 중복가입 방지 로직을 개발 중에도 흉내 낼 수 있도록 안정적인 가짜 CI 부여
      ci: `mock-ci-${cleanPhone}`,
      di: `mock-di-${cleanPhone}`,
    };
  },
};
