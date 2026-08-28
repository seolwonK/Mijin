// 본인인증 provider 선택 규칙 — "설정을 빠뜨리면 무인증 가입이 열린다"를 막는 게이트.
//
// mock provider 는 사용자가 입력한 이름·번호를 그대로 인증 처리한다. 그래서 프로덕션에서
// IDENTITY_PROVIDER 를 빠뜨렸을 때 조용히 mock 으로 떨어지면 본인확인 절차 자체가 사라진다.
// 그 경로가 닫혀 있는지를 여기서 못박는다.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getIdentityPublicConfig, identityProviderName } from '@/lib/identity/config';

afterEach(() => vi.unstubAllEnvs());

describe('identityProviderName', () => {
  it('IDENTITY_PROVIDER=portone 이면 portone', () => {
    vi.stubEnv('IDENTITY_PROVIDER', 'portone');
    expect(identityProviderName()).toBe('portone');
  });

  it('개발 환경에서 미설정이면 mock 으로 떨어진다', () => {
    vi.stubEnv('IDENTITY_PROVIDER', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(identityProviderName()).toBe('mock');
  });

  it('프로덕션에서 미설정이면 mock 으로 떨어지지 않고 던진다 (fail-closed)', () => {
    vi.stubEnv('IDENTITY_PROVIDER', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_MOCK_IDENTITY', '');
    expect(() => identityProviderName()).toThrow('IDENTITY_PROVIDER=portone');
  });

  it('프로덕션에서 오타 난 값도 mock 으로 통과시키지 않는다', () => {
    vi.stubEnv('IDENTITY_PROVIDER', 'portOne');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_MOCK_IDENTITY', '');
    expect(() => identityProviderName()).toThrow('IDENTITY_PROVIDER=portone');
  });

  it('ALLOW_MOCK_IDENTITY=1 은 의도적 탈출구로 열어 준다', () => {
    vi.stubEnv('IDENTITY_PROVIDER', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_MOCK_IDENTITY', '1');
    expect(identityProviderName()).toBe('mock');
  });
});

describe('getIdentityPublicConfig', () => {
  it('portone 설정을 storeId·channelKey 만 담아 내려준다 (API Secret 은 절대 포함하지 않는다)', () => {
    vi.stubEnv('IDENTITY_PROVIDER', 'portone');
    vi.stubEnv('PORTONE_STORE_ID', 'store-abc');
    vi.stubEnv('PORTONE_CHANNEL_KEY', 'channel-abc');
    vi.stubEnv('PORTONE_API_SECRET', 'super-secret-value');

    const config = getIdentityPublicConfig();
    expect(config).toEqual({
      provider: 'portone',
      storeId: 'store-abc',
      channelKey: 'channel-abc',
    });
    expect(JSON.stringify(config)).not.toContain('super-secret-value');
  });

  it('storeId·channelKey 가 비면 mock 으로 폴백하지 않고 던진다', () => {
    vi.stubEnv('IDENTITY_PROVIDER', 'portone');
    vi.stubEnv('PORTONE_STORE_ID', '');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', '');
    vi.stubEnv('PORTONE_CHANNEL_KEY', 'channel-abc');
    expect(() => getIdentityPublicConfig()).toThrow('본인인증 설정이 없습니다');
  });
});
