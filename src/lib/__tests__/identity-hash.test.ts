// CI/DI 저장 해시 — 평문 고유식별정보를 DB 에 남기지 않기 위한 한 겹.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashIdentityKey } from '@/lib/identity/hash';

const CI = 'kJ2n8sLp+Qw3xYzA1bC4dEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnopqrstuvwx==';

afterEach(() => vi.unstubAllEnvs());

describe('hashIdentityKey', () => {
  it('원본이 결과에 남지 않는 64자 16진 해시를 만든다', () => {
    vi.stubEnv('IDENTITY_HASH_SECRET', 'hash-key-1');
    const h = hashIdentityKey(CI);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(CI);
  });

  it('같은 값·같은 키는 같은 해시 — 중복가입 비교가 성립한다', () => {
    vi.stubEnv('IDENTITY_HASH_SECRET', 'hash-key-1');
    expect(hashIdentityKey(CI)).toBe(hashIdentityKey(CI));
  });

  it('다른 값은 다른 해시', () => {
    vi.stubEnv('IDENTITY_HASH_SECRET', 'hash-key-1');
    expect(hashIdentityKey(CI)).not.toBe(hashIdentityKey(`${CI}x`));
  });

  it('키가 다르면 해시도 다르다 — 유출된 DB 만으로는 대조할 수 없다', () => {
    vi.stubEnv('IDENTITY_HASH_SECRET', 'hash-key-1');
    const a = hashIdentityKey(CI);
    vi.stubEnv('IDENTITY_HASH_SECRET', 'hash-key-2');
    expect(hashIdentityKey(CI)).not.toBe(a);
  });

  it('값이 없으면(대행사 미제공 채널) null 을 돌려준다', () => {
    vi.stubEnv('IDENTITY_HASH_SECRET', 'hash-key-1');
    expect(hashIdentityKey(undefined)).toBeNull();
    expect(hashIdentityKey(null)).toBeNull();
    expect(hashIdentityKey('   ')).toBeNull();
  });

  it('IDENTITY_HASH_SECRET 이 없으면 AUTH_SECRET 으로 떨어진다', () => {
    vi.stubEnv('IDENTITY_HASH_SECRET', '');
    vi.stubEnv('AUTH_SECRET', 'auth-fallback');
    expect(hashIdentityKey(CI)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('키가 하나도 없으면 조용히 평문을 남기지 않고 던진다', () => {
    vi.stubEnv('IDENTITY_HASH_SECRET', '');
    vi.stubEnv('AUTH_SECRET', '');
    expect(() => hashIdentityKey(CI)).toThrow('해시 키가 없습니다');
  });
});
