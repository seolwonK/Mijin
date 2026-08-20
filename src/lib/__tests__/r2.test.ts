import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { r2Config, signRequest, type R2Config } from '@/lib/storage/r2';

const FULL_ENV = {
  R2_ACCOUNT_ID: 'acc123',
  R2_ACCESS_KEY_ID: 'ak_test',
  R2_SECRET_ACCESS_KEY: 'sk_test',
  R2_BUCKET: 'mijin-uploads',
};

const CFG: R2Config = {
  accessKeyId: 'ak_test',
  secretAccessKey: 'sk_test',
  bucket: 'mijin-uploads',
  endpoint: 'https://acc123.r2.cloudflarestorage.com',
};

const AT = new Date('2026-08-20T04:05:06.000Z');

describe('r2Config', () => {
  it('계정 ID 로 기본 엔드포인트를 만든다', () => {
    expect(r2Config(FULL_ENV)).toEqual(CFG);
  });

  it('R2_ENDPOINT 가 있으면 그쪽을 쓰고 끝 슬래시를 떼어낸다', () => {
    const cfg = r2Config({
      ...FULL_ENV,
      R2_ENDPOINT: 'https://files.example.com/',
    });
    expect(cfg?.endpoint).toBe('https://files.example.com');
  });

  it('필수 값이 하나라도 비면 미설정으로 본다', () => {
    // 반쯤 켜지면 업로드는 시도하는데 매번 실패하는 상태가 되어 DB 폴백보다 나쁘다.
    for (const key of [
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_ACCOUNT_ID',
    ]) {
      expect(r2Config({ ...FULL_ENV, [key]: '' })).toBeNull();
    }
    expect(r2Config({})).toBeNull();
  });

  it('엔드포인트를 직접 주면 계정 ID 는 없어도 된다', () => {
    const env: Record<string, string | undefined> = {
      ...FULL_ENV,
      R2_ACCOUNT_ID: undefined,
      R2_ENDPOINT: 'https://files.example.com',
    };
    expect(r2Config(env)).not.toBeNull();
  });
});

describe('signRequest', () => {
  it('버킷과 키로 URL 을 만들고 경로 구분자는 살려둔다', () => {
    const { url } = signRequest(CFG, 'GET', 'requests/abc/1 2.jpg', null, {}, AT);
    // 세그먼트만 인코딩 — '/' 가 %2F 로 바뀌면 R2 가 다른 키로 본다.
    expect(url).toBe(
      'https://acc123.r2.cloudflarestorage.com/mijin-uploads/requests/abc/1%202.jpg',
    );
  });

  it('본문 해시를 x-amz-content-sha256 에 싣는다', () => {
    const body = new Uint8Array([1, 2, 3]);
    const { headers } = signRequest(CFG, 'PUT', 'k.jpg', body, {}, AT);
    expect(headers['x-amz-content-sha256']).toBe(
      createHash('sha256').update(body).digest('hex'),
    );
  });

  it('본문이 없으면 빈 문자열 해시를 쓴다', () => {
    const { headers } = signRequest(CFG, 'GET', 'k.jpg', null, {}, AT);
    expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update('').digest('hex'));
  });

  it('Authorization 에 자격증명 스코프와 서명 대상 헤더가 들어간다', () => {
    const { headers } = signRequest(
      CFG,
      'PUT',
      'k.jpg',
      new Uint8Array([1]),
      { 'content-type': 'image/jpeg' },
      AT,
    );
    // region 은 R2 규약상 항상 auto.
    expect(headers.Authorization).toContain(
      'Credential=ak_test/20260820/auto/s3/aws4_request',
    );
    // 서명 대상 헤더는 알파벳 순이어야 한다.
    expect(headers.Authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
    );
    expect(headers['x-amz-date']).toBe('20260820T040506Z');
  });

  it('같은 입력·같은 시각이면 같은 서명이 나온다', () => {
    const a = signRequest(CFG, 'GET', 'k.jpg', null, {}, AT);
    const b = signRequest(CFG, 'GET', 'k.jpg', null, {}, AT);
    expect(a.headers.Authorization).toBe(b.headers.Authorization);
  });

  it('키·본문·시각·비밀키 중 무엇이 달라져도 서명이 달라진다', () => {
    const base = signRequest(CFG, 'GET', 'k.jpg', null, {}, AT).headers.Authorization;
    const variants = [
      signRequest(CFG, 'GET', 'other.jpg', null, {}, AT),
      signRequest(CFG, 'PUT', 'k.jpg', new Uint8Array([9]), {}, AT),
      signRequest(CFG, 'GET', 'k.jpg', null, {}, new Date('2026-08-20T04:05:07.000Z')),
      signRequest({ ...CFG, secretAccessKey: 'sk_other' }, 'GET', 'k.jpg', null, {}, AT),
    ];
    for (const v of variants) expect(v.headers.Authorization).not.toBe(base);
  });
});
