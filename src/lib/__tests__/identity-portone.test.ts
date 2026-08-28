// PortOne 본인인증 서버 재검증 계약 — 본인확인서비스 자체점검 2·4번 항목의 방어선.
//
// 이 provider 는 "브라우저가 보내온 identityVerificationId 로 대행사에 다시 물어본다"는
// 한 가지 일을 한다. 그래서 검증할 것도 셋뿐이다: 정말 인증됐는가(status), 내가 물어본
// 그 건이 맞는가(id), 지금 막 끝난 인증인가(verifiedAt). 셋 중 하나라도 빠지면
// 과거 인증건이나 남의 인증건이 가입까지 흘러간다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { portoneProvider } from '@/lib/identity/portone';
import { IDENTITY_TTL_MS } from '@/lib/identity/config';

const ID = 'iv0000000abcdefghijklmnopqrstuvwxyz0123';

type Body = Record<string, unknown>;

/** PortOne GET /identity-verifications/{id} 응답을 흉내 낸다. */
function stubPortOne(body: Body, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function verifiedBody(over: Body = {}): Body {
  return {
    status: 'VERIFIED',
    id: ID,
    verifiedAt: new Date().toISOString(),
    verifiedCustomer: {
      name: '홍길동',
      phoneNumber: '010-9999-8800',
      birthDate: '1990-01-02',
      gender: 'MALE',
      ci: 'CI-VALUE',
      di: 'DI-VALUE',
    },
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv('PORTONE_API_SECRET', 'test-secret');
  vi.stubEnv('PORTONE_STORE_ID', 'store-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('portoneProvider.verify', () => {
  it('VERIFIED 응답을 정규화해 돌려준다 (전화번호는 숫자만)', async () => {
    stubPortOne(verifiedBody());
    const result = await portoneProvider.verify({ identityVerificationId: ID });
    expect(result).toEqual({
      providerRef: ID,
      name: '홍길동',
      phone: '01099998800',
      birthDate: '1990-01-02',
      gender: 'MALE',
      ci: 'CI-VALUE',
      di: 'DI-VALUE',
    });
  });

  it('API Secret 은 Authorization 헤더로만 나가고 URL 에 실리지 않는다', async () => {
    const fetchMock = stubPortOne(verifiedBody());
    await portoneProvider.verify({ identityVerificationId: ID });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).not.toContain('test-secret');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'PortOne test-secret',
    );
  });

  it('클라이언트가 보낸 값이 아니라 대행사 응답의 이름·번호를 쓴다', async () => {
    // 브라우저가 name/phone 을 함께 보내와도 provider 는 쳐다보지 않는다(파라미터 변조 방어).
    stubPortOne(verifiedBody());
    const result = await portoneProvider.verify({
      identityVerificationId: ID,
      name: '변조된이름',
      phone: '01000000000',
    });
    expect(result.name).toBe('홍길동');
    expect(result.phone).toBe('01099998800');
  });

  it('identityVerificationId 가 없으면 거부한다', async () => {
    stubPortOne(verifiedBody());
    await expect(portoneProvider.verify({})).rejects.toThrow('본인인증 정보');
  });

  it('PORTONE_API_SECRET 이 없으면 거부한다 (조용히 통과시키지 않는다)', async () => {
    vi.stubEnv('PORTONE_API_SECRET', '');
    stubPortOne(verifiedBody());
    await expect(portoneProvider.verify({ identityVerificationId: ID })).rejects.toThrow(
      'PORTONE_API_SECRET',
    );
  });

  it('status 가 VERIFIED 가 아니면 거부한다', async () => {
    stubPortOne({ status: 'READY', id: ID });
    await expect(portoneProvider.verify({ identityVerificationId: ID })).rejects.toThrow(
      '본인인증이 완료되지 않았습니다',
    );
  });

  it('응답의 id 가 요청한 id 와 다르면 거부한다 (남의 인증건 혼입 차단)', async () => {
    stubPortOne(verifiedBody({ id: 'iv9999999zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' }));
    await expect(portoneProvider.verify({ identityVerificationId: ID })).rejects.toThrow(
      '요청과 일치하지 않습니다',
    );
  });

  it('인증 완료 시각이 TTL 보다 오래됐으면 거부한다 (과거 인증정보 재사용 차단)', async () => {
    stubPortOne(
      verifiedBody({
        verifiedAt: new Date(Date.now() - IDENTITY_TTL_MS - 1_000).toISOString(),
      }),
    );
    await expect(portoneProvider.verify({ identityVerificationId: ID })).rejects.toThrow(
      '시간이 너무 지났습니다',
    );
  });

  it('TTL 안쪽의 인증 완료 시각은 통과한다', async () => {
    stubPortOne(
      verifiedBody({
        verifiedAt: new Date(Date.now() - IDENTITY_TTL_MS + 30_000).toISOString(),
      }),
    );
    await expect(
      portoneProvider.verify({ identityVerificationId: ID }),
    ).resolves.toMatchObject({ phone: '01099998800' });
  });

  it('미래 시각(서버·대행사 시계 오차)은 막지 않는다', async () => {
    stubPortOne(verifiedBody({ verifiedAt: new Date(Date.now() + 60_000).toISOString() }));
    await expect(
      portoneProvider.verify({ identityVerificationId: ID }),
    ).resolves.toMatchObject({ name: '홍길동' });
  });

  it('파싱 불가능한 verifiedAt 은 통과시키지 않는다', async () => {
    stubPortOne(verifiedBody({ verifiedAt: 'not-a-date' }));
    await expect(portoneProvider.verify({ identityVerificationId: ID })).rejects.toThrow(
      '완료 시각을 확인할 수 없습니다',
    );
  });

  it('HTTP 오류 응답은 삼키지 않고 던진다', async () => {
    stubPortOne({ message: 'not found' }, { ok: false, status: 404 });
    await expect(portoneProvider.verify({ identityVerificationId: ID })).rejects.toThrow(
      'PortOne 404',
    );
  });
});
